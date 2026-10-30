# PLCSim Advanced module (Windows)

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/plcsim.md)

Drives the S7-1500 virtual PLCs of **S7-PLCSIM Advanced** through its Simulation Runtime API (.NET
assembly `Siemens.Simatic.Simulation.Runtime.Api`), loaded by Windows PowerShell 5.1 in a background
process: no native module to compile. The API folder is detected automatically (latest version in
`C:\Program Files (x86)\Common Files\Siemens\PLCSIMADV\API\<version>`) or set in the module.

- Connection to the API (optionally when Sulfur starts): API version, Runtime Manager availability,
  network mode (Softbus or TCP/IP).
- **Remote PC**: connection to the Runtime Manager of another PC (IP address or name, port opened in
  the PLCSIM Advanced control panel, 50000 by default); the instances listed and driven are then
  those of that PC. Connection loss is reported.
- **Without PLCSIM Advanced installed**: the module asks for the folder containing the API DLLs
  (copied from a PC where it is installed). The API is a native Windows library (C++/CLI): it cannot
  be loaded on Linux or macOS, where the module stays unavailable.
- **Instances**: creation (CPU type), power on / off, RUN / STOP, memory reset, deletion, IP address
  of each interface. The program is downloaded from TIA Portal.
- **Variables**: tag table of the downloaded program (filter, arrays expanded), or addresses of the
  inputs, outputs and markers; **monitoring** of several instances, written from the list and
  published as points: a simulator flow can drive the inputs of the virtual PLC to simulate the
  process. Monitored variables are kept across restarts.
- Real-API test: `SULFUR_PLCSIM_LIVE=1 npm test` (creates, powers on and deletes a test instance).
