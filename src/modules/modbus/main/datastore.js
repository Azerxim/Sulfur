import { TABLES } from '../shared/constants'

/** Mémoire des quatre tables Modbus (bits et registres 16 bits). */
export class DataStore {
  constructor(size) {
    this.size = size
    this.tables = {
      coils: new Uint8Array(size),
      discreteInputs: new Uint8Array(size),
      holdingRegisters: new Uint16Array(size),
      inputRegisters: new Uint16Array(size)
    }
  }

  inRange(address, quantity) {
    return Number.isInteger(address) && address >= 0 && quantity >= 1 && address + quantity <= this.size
  }

  read(table, address, quantity) {
    const values = Array.from(this.tables[table].subarray(address, address + quantity))
    return TABLES[table].bit ? values.map((v) => v === 1) : values
  }

  write(table, address, values) {
    const target = this.tables[table]
    values.forEach((v, i) => {
      target[address + i] = TABLES[table].bit ? (v ? 1 : 0) : v & 0xffff
    })
  }
}
