# Pont entre Sulfur et l'API Simulation Runtime de S7-PLCSIM Advanced (assembly .NET Framework).
#
# Lancé par le process principal avec Windows PowerShell 5.1 :
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File bridge.ps1 -ApiPath <dossier ou DLL>
#
# Protocole : une requête JSON par ligne sur l'entrée standard, { id, method, params } ; une réponse
# par ligne sur la sortie standard, { id, ok, result } ou { id, ok: false, error, code }. Au démarrage,
# le pont envoie { event: 'ready', data: <info> } ou { event: 'fatal', error }.
#
# Toute sortie non capturée d'une commande PowerShell partirait sur la sortie standard et casserait le
# protocole : les gestionnaires écrivent leur résultat dans $script:Result et leur sortie est ignorée.

param([Parameter(Mandatory = $true)] [string] $ApiPath)

$ErrorActionPreference = 'Stop'
$Utf8 = New-Object System.Text.UTF8Encoding $false
$Stdin = New-Object System.IO.StreamReader([Console]::OpenStandardInput(), $Utf8)
$Stdout = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $Utf8)
$Stdout.AutoFlush = $true

function Send($Message) {
  $Stdout.WriteLine((ConvertTo-Json -InputObject $Message -Compress -Depth 8))
}

# Exception d'origine (PowerShell enveloppe les exceptions des méthodes .NET) et code d'erreur de l'API.
function Describe-Error($ErrorRecord) {
  $ex = $ErrorRecord.Exception
  while ($ex.InnerException -and $ex -is [System.Management.Automation.MethodInvocationException]) { $ex = $ex.InnerException }
  $code = $null
  if ($ex.PSObject.Properties['RuntimeErrorCode']) { $code = [string]$ex.RuntimeErrorCode }
  $message = $ex.Message
  if ($code -and (-not $message -or $message -match 'RuntimeErrorCode|Exception of type')) { $message = $code }
  @{ error = $message; code = $code }
}

# --- Chargement de l'API -----------------------------------------------------------------------

try {
  $Dll = $ApiPath
  if (Test-Path -LiteralPath $ApiPath -PathType Container) {
    $Name = 'Siemens.Simatic.Simulation.Runtime.Api.x86.dll'
    if ([Environment]::Is64BitProcess) { $Name = 'Siemens.Simatic.Simulation.Runtime.Api.x64.dll' }
    $Dll = Join-Path $ApiPath $Name
  }
  if (-not (Test-Path -LiteralPath $Dll -PathType Leaf)) { throw "DLL not found: $Dll" }
  $null = [System.Reflection.Assembly]::LoadFrom($Dll)
  $Manager = [Siemens.Simatic.Simulation.Runtime.SimulationRuntimeManager]
  $Ns = 'Siemens.Simatic.Simulation.Runtime'
} catch {
  Send @{ event = 'fatal'; error = (Describe-Error $_).error }
  exit 1
}

function Safe([scriptblock] $Block) {
  try { & $Block } catch { $null }
}

function Get-Info {
  $version = [uint32]$Manager::Version
  @{
    apiVersion = '{0}.{1}' -f ($version -shr 16), ($version -band 0xFFFF)
    dll = $Dll
    bits = $(if ([Environment]::Is64BitProcess) { 64 } else { 32 })
    runtimeAvailable = [bool](Safe { $Manager::IsRuntimeManagerAvailable })
    networkMode = [string](Safe { $Manager::NetworkMode })
    storagePath = [string](Safe { $Manager::DefaultStoragePath })
    cpuTypes = @([Enum]::GetNames([Type]"$Ns.ECPUType"))
  }
}

# --- Instances ---------------------------------------------------------------------------------

$Instances = @{}

function Get-Instance($Id) {
  $key = [int]$Id
  if (-not $Instances.ContainsKey($key)) { $Instances[$key] = $Manager::CreateInterface($key) }
  $Instances[$key]
}

function Describe-Instance($Info) {
  $inst = Get-Instance $Info.ID
  @{
    id = [int]$Info.ID
    name = [string]$Info.Name
    cpuType = [string](Safe { $inst.CPUType })
    state = [string](Safe { $inst.OperatingState })
    controllerName = [string](Safe { $inst.ControllerName })
    shortDesignation = [string](Safe { $inst.ControllerShortDesignation })
    articleNumber = [string](Safe { $inst.ArticleNumber })
    ip = @(Safe { $inst.ControllerIP } | Where-Object { $_ })
    communication = [string](Safe { $inst.CommunicationInterface })
    storagePath = [string](Safe { $inst.StoragePath })
    scaleFactor = Safe { [double]$inst.ScaleFactor }
  }
}

function List-Instances {
  $infos = @(Safe { $Manager::RegisteredInstanceInfo })
  $ids = @($infos | ForEach-Object { [int]$_.ID })
  foreach ($key in @($Instances.Keys)) { if ($ids -notcontains $key) { $Instances.Remove($key) } }
  # La virgule préserve le tableau (PowerShell déroule les tableaux renvoyés par une fonction).
  , @($infos | ForEach-Object { Describe-Instance $_ })
}

# --- Variables -----------------------------------------------------------------------------------

# Table des variables de l'instance (entrées, sorties, mémentos, compteurs, temporisations, DB).
# Une énumération typée est nécessaire : une valeur issue de [Enum]::Parse fait échouer l'appel.
function Update-Tags($Inst, [bool] $HmiOnly = $true) {
  $Inst.UpdateTagList([Siemens.Simatic.Simulation.Runtime.ETagListDetails]::IOMCTDB, $HmiOnly)
}

# Appel d'une variable par nom ; si la table des variables n'est pas à jour (premier accès, programme
# rechargé), elle est relue puis l'appel est refait une fois.
function With-Tags($Inst, [scriptblock] $Block) {
  try {
    & $Block
  } catch {
    if ((Describe-Error $_).code -ne 'NotUpToDate') { throw }
    Update-Tags $Inst
    & $Block
  }
}

# Noms d'éléments d'un tableau : Tab[0], Tab[0,1]… (au plus $Max éléments).
function Expand-Indices($Dimensions, [int] $Max) {
  $names = @('')
  foreach ($dim in $Dimensions) {
    $next = New-Object System.Collections.Generic.List[string]
    foreach ($prefix in $names) {
      for ($i = 0; $i -lt $dim.Count; $i++) {
        $index = $dim.StartIndex + $i
        if ($prefix) { $next.Add("$prefix,$index") } else { $next.Add("$index") }
        if ($next.Count -ge $Max) { break }
      }
      if ($next.Count -ge $Max) { break }
    }
    $names = $next
  }
  @($names | ForEach-Object { "[$_]" })
}

function List-Tags($Id, [bool] $HmiOnly) {
  $inst = Get-Instance $Id
  Update-Tags $inst $HmiOnly
  $tags = New-Object System.Collections.Generic.List[object]
  foreach ($tag in $inst.TagInfos) {
    $primitive = [string]$tag.PrimitiveDataType
    $dataType = [string]$tag.DataType
    $readable = $primitive -notin @('Struct', 'Unspecific') -or $dataType -in @('String', 'WString')
    if (-not $readable) { continue }
    $base = @{
      area = [string]$tag.Area
      dataType = $dataType
      primitive = $primitive
      offset = [int]$tag.Offset
      bit = [int]$tag.Bit
    }
    if ($tag.Dimension -and $tag.Dimension.Count -gt 0) {
      foreach ($suffix in (Expand-Indices $tag.Dimension 256)) {
        $tags.Add(($base + @{ name = "$($tag.Name)$suffix" }))
      }
    } else {
      $tags.Add(($base + @{ name = [string]$tag.Name }))
    }
  }
  , $tags.ToArray()
}

# Lecture d'une variable selon son type (primitif, ou chaîne).
function Read-Tag($Inst, [string] $Name, [string] $Type) {
  switch ($Type) {
    'String' { return $Inst.ReadString($Name) }
    'WString' { return $Inst.ReadWString($Name) }
    'Bool' { return $Inst.ReadBool($Name) }
    'Int8' { return $Inst.ReadInt8($Name) }
    'Int16' { return $Inst.ReadInt16($Name) }
    'Int32' { return $Inst.ReadInt32($Name) }
    'Int64' { return $Inst.ReadInt64($Name) }
    'UInt8' { return $Inst.ReadUInt8($Name) }
    'UInt16' { return $Inst.ReadUInt16($Name) }
    'UInt32' { return $Inst.ReadUInt32($Name) }
    'UInt64' { return $Inst.ReadUInt64($Name) }
    'Float' { return $Inst.ReadFloat($Name) }
    'Double' { return $Inst.ReadDouble($Name) }
    'Char' { return [string][char][byte]$Inst.ReadChar($Name) }
    'WChar' { return [string]$Inst.ReadWChar($Name) }
  }
  $value = $Inst.Read($Name)
  $type = [string]$value.Type
  if ($type -eq 'Char') { return [string][char][byte]$value.Char }
  if ($type -eq 'WChar') { return [string]$value.WChar }
  $value.$type
}

function Write-Tag($Inst, [string] $Name, [string] $Type, $Value) {
  switch ($Type) {
    'String' { $Inst.WriteString($Name, [string]$Value); return }
    'WString' { $Inst.WriteWString($Name, [string]$Value); return }
    'Bool' { $Inst.WriteBool($Name, [bool]$Value); return }
    'Int8' { $Inst.WriteInt8($Name, [sbyte]$Value); return }
    'Int16' { $Inst.WriteInt16($Name, [int16]$Value); return }
    'Int32' { $Inst.WriteInt32($Name, [int32]$Value); return }
    'Int64' { $Inst.WriteInt64($Name, [int64]$Value); return }
    'UInt8' { $Inst.WriteUInt8($Name, [byte]$Value); return }
    'UInt16' { $Inst.WriteUInt16($Name, [uint16]$Value); return }
    'UInt32' { $Inst.WriteUInt32($Name, [uint32]$Value); return }
    'UInt64' { $Inst.WriteUInt64($Name, [uint64]$Value); return }
    'Float' { $Inst.WriteFloat($Name, [single]$Value); return }
    'Double' { $Inst.WriteDouble($Name, [double]$Value); return }
    'Char' { $Inst.WriteChar($Name, [sbyte][int][char]([string]$Value)[0]); return }
    'WChar' { $Inst.WriteWChar($Name, [char]([string]$Value)[0]); return }
  }
  throw "Unsupported type: $Type"
}

function Get-Area($Inst, [string] $Area) {
  switch ($Area) {
    'I' { return $Inst.InputArea }
    'Q' { return $Inst.OutputArea }
    'M' { return $Inst.MarkerArea }
  }
  throw "Unknown area: $Area"
}

# Lecture groupée : variables par nom ou octets d'une zone (I, Q, M), sur plusieurs instances.
function Read-Items($Items) {
  , @($Items | ForEach-Object {
    $item = $_
    try {
      $inst = Get-Instance $item.id
      if ($item.kind -eq 'area') {
        $bytes = (Get-Area $inst $item.area).ReadBytes([uint32]$item.offset, [uint32]$item.length)
        @{ value = @($bytes | ForEach-Object { [int]$_ }) }
      } else {
        @{ value = (With-Tags $inst { Read-Tag $inst $item.name $item.type }) }
      }
    } catch {
      Describe-Error $_
    }
  })
}

# --- Requêtes ------------------------------------------------------------------------------------

$Handlers = @{
  info = { param($p) $script:Result = Get-Info }
  instances = { param($p) $script:Result = List-Instances }
  create = {
    param($p)
    if ($p.cpuType) {
      $inst = $Manager::RegisterInstance([Siemens.Simatic.Simulation.Runtime.ECPUType][string]$p.cpuType, [string]$p.name)
    } else {
      $inst = $Manager::RegisterInstance([string]$p.name)
    }
    $Instances[[int]$inst.ID] = $inst
    $script:Result = [int]$inst.ID
  }
  powerOn = { param($p) $script:Result = [string](Get-Instance $p.id).PowerOn([uint32]$p.timeout) }
  powerOff = { param($p) (Get-Instance $p.id).PowerOff([uint32]$p.timeout) }
  run = { param($p) (Get-Instance $p.id).Run([uint32]$p.timeout) }
  stop = { param($p) (Get-Instance $p.id).Stop([uint32]$p.timeout) }
  memoryReset = { param($p) (Get-Instance $p.id).MemoryReset([uint32]$p.timeout) }
  unregister = {
    param($p)
    (Get-Instance $p.id).UnregisterInstance()
    $Instances.Remove([int]$p.id)
  }
  setIp = {
    param($p)
    $suite = New-Object "$Ns.SIPSuite4" ([string]$p.ip), ([string]$p.mask), ([string]$p.gateway)
    (Get-Instance $p.id).SetIPSuite([uint32]$p.interface, $suite, $true)
  }
  tags = { param($p) $script:Result = List-Tags $p.id ([bool]$p.hmiOnly) }
  read = { param($p) $script:Result = Read-Items $p.items }
  write = {
    param($p)
    $inst = Get-Instance $p.id
    With-Tags $inst { Write-Tag $inst $p.name $p.type $p.value }
  }
  writeArea = {
    param($p)
    $bytes = [byte[]]@($p.bytes | ForEach-Object { [byte]$_ })
    $null = (Get-Area (Get-Instance $p.id) $p.area).WriteBytes([uint32]$p.offset, $bytes)
  }
  writeBit = {
    param($p)
    (Get-Area (Get-Instance $p.id) $p.area).WriteBit([uint32]$p.offset, [byte]$p.bit, [bool]$p.value)
  }
}

try {
  $Info = Get-Info
} catch {
  Send @{ event = 'fatal'; error = (Describe-Error $_).error }
  exit 1
}
Send @{ event = 'ready'; data = $Info }

while ($true) {
  $line = $Stdin.ReadLine()
  if ($null -eq $line) { break }
  if (-not $line.Trim()) { continue }
  $id = $null
  try {
    $request = ConvertFrom-Json $line
    $id = $request.id
    if ($request.method -eq 'exit') { Send @{ id = $id; ok = $true; result = $null }; break }
    $handler = $Handlers[[string]$request.method]
    if (-not $handler) { throw "Unknown method: $($request.method)" }
    $script:Result = $null
    $null = & $handler $request.params
    Send @{ id = $id; ok = $true; result = $script:Result }
  } catch {
    # Interface d'une instance supprimée entre-temps : elle sera recréée au prochain appel.
    if ($request -and $request.params -and $null -ne $request.params.id) { $Instances.Remove([int]$request.params.id) }
    $failure = Describe-Error $_
    Send @{ id = $id; ok = $false; error = $failure.error; code = $failure.code }
  }
}

foreach ($inst in $Instances.Values) { Safe { $inst.Dispose() } | Out-Null }
