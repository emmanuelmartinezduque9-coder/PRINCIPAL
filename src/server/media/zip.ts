import { crc32 } from "node:zlib";

/**
 * ZIP en flujo, sin comprimir (los MP4 ya van comprimidos: comprimir solo gastaría CPU) y sin
 * cargar ningún archivo entero en memoria. Cada archivo lleva su CRC y tamaños en un «descriptor»
 * detrás de los datos (bit 3), así se puede ir mandando mientras se lee. Con ZIP64 cuando hace falta
 * (archivos o ZIP de más de 4 GB). Los nombres van en UTF-8 (bit 11): el Finder y el iPhone los
 * enseñan con sus acentos.
 */

export interface ZipEntry {
  /** Ruta dentro del ZIP (con `/` para carpetas). */
  name: string;
  /** Fecha de modificación que se apunta. */
  date: Date;
  /** Los bytes del archivo (se piden justo cuando toca). */
  open: () => Promise<AsyncIterable<Uint8Array> | Iterable<Uint8Array>>;
}

const MAX32 = 0xffffffff;
const UTF8 = 1 << 11;
const DESCRIPTOR = 1 << 3;

function dosTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Un nombre seguro dentro del ZIP: sin rutas absolutas, `..` ni caracteres de control. */
export function safeZipName(name: string): string {
  return name
    .replace(/[\u0000-\u001f\\:*?"<>|]/g, "")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
}

/** El ZIP de `entries`, en flujo. */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const emit = (chunk: Buffer | Uint8Array) => {
        controller.enqueue(chunk instanceof Buffer ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.length) : chunk);
        offset += chunk.length;
      };
      if (index < entries.length) {
        const entry = entries[index++];
        const name = Buffer.from(safeZipName(entry.name) || `archivo-${index}`, "utf8");
        const { time, day } = dosTime(entry.date);
        const start = offset;
        // Cabecera local: CRC y tamaños a cero (van en el descriptor); versión 4.5 por si hace falta ZIP64.
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(45, 4);
        local.writeUInt16LE(UTF8 | DESCRIPTOR, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(day, 12);
        local.writeUInt16LE(name.length, 26);
        emit(local);
        emit(name);
        let crc = 0;
        let size = 0;
        for await (const chunk of await entry.open()) {
          crc = crc32(chunk, crc);
          size += chunk.length;
          emit(chunk);
        }
        const big = size >= MAX32 || start >= MAX32;
        // Descriptor de datos (con tamaños de 8 bytes si es ZIP64).
        const descriptor = Buffer.alloc(big ? 24 : 16);
        descriptor.writeUInt32LE(0x08074b50, 0);
        descriptor.writeUInt32LE(crc >>> 0, 4);
        if (big) {
          descriptor.writeBigUInt64LE(BigInt(size), 8);
          descriptor.writeBigUInt64LE(BigInt(size), 16);
        } else {
          descriptor.writeUInt32LE(size, 8);
          descriptor.writeUInt32LE(size, 12);
        }
        emit(descriptor);
        // Entrada del directorio central.
        const extra = big ? Buffer.alloc(28) : Buffer.alloc(0);
        if (big) {
          extra.writeUInt16LE(0x0001, 0);
          extra.writeUInt16LE(24, 2);
          extra.writeBigUInt64LE(BigInt(size), 4);
          extra.writeBigUInt64LE(BigInt(size), 12);
          extra.writeBigUInt64LE(BigInt(start), 20);
        }
        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE((3 << 8) | 45, 4); // hecho en Unix, versión 4.5
        header.writeUInt16LE(45, 6);
        header.writeUInt16LE(UTF8 | DESCRIPTOR, 8);
        header.writeUInt16LE(0, 10);
        header.writeUInt16LE(time, 12);
        header.writeUInt16LE(day, 14);
        header.writeUInt32LE(crc >>> 0, 16);
        header.writeUInt32LE(big ? MAX32 : size, 20);
        header.writeUInt32LE(big ? MAX32 : size, 24);
        header.writeUInt16LE(name.length, 28);
        header.writeUInt16LE(extra.length, 30);
        header.writeUInt32LE((0o100644 << 16) >>> 0, 38); // archivo normal, rw-r--r--
        header.writeUInt32LE(big ? MAX32 : start, 42);
        central.push(header, name, extra);
        return;
      }
      // Directorio central y final (con los registros ZIP64 si algo no cabe en 32 bits).
      const centralStart = offset;
      for (const part of central) emit(part);
      const centralSize = offset - centralStart;
      const count = entries.length;
      if (centralStart >= MAX32 || centralSize >= MAX32 || count >= 0xffff) {
        const zip64End = offset;
        const record = Buffer.alloc(56);
        record.writeUInt32LE(0x06064b50, 0);
        record.writeBigUInt64LE(BigInt(44), 4);
        record.writeUInt16LE(45, 12);
        record.writeUInt16LE(45, 14);
        record.writeBigUInt64LE(BigInt(count), 24);
        record.writeBigUInt64LE(BigInt(count), 32);
        record.writeBigUInt64LE(BigInt(centralSize), 40);
        record.writeBigUInt64LE(BigInt(centralStart), 48);
        emit(record);
        const locator = Buffer.alloc(20);
        locator.writeUInt32LE(0x07064b50, 0);
        locator.writeBigUInt64LE(BigInt(zip64End), 8);
        locator.writeUInt32LE(1, 16);
        emit(locator);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(Math.min(count, 0xffff), 8);
      end.writeUInt16LE(Math.min(count, 0xffff), 10);
      end.writeUInt32LE(Math.min(centralSize, MAX32), 12);
      end.writeUInt32LE(Math.min(centralStart, MAX32), 16);
      emit(end);
      controller.close();
    },
  });
}
