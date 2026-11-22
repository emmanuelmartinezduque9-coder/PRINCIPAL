// texto06b.swift: dibuja los rótulos con el estilo fijo 06B del dueño.
// TikTokDisplay-Medium, blanco #FFFFFF, contorno exterior negro de 0,05 em (strokeWidth -10
// dibujado debajo del relleno), interlínea 35/31 em. Cada rótulo sale como PNG transparente de
// 886x318, que montador.py coloca en x112/y287 sobre 1080x1920 (caja invisible, centrado H y V).
// Misma lógica de ajuste que el renderizador antiguo (order43_text06b.swift): se baja el tamaño
// desde 74 hasta que todas las líneas caben, sin deformar ni omitir texto.
// Uso: swift texto06b.swift cues.json carpeta_salida fuente.ttf
import AppKit
import CoreText

let args = CommandLine.arguments
guard args.count == 4 else { fatalError("uso: swift texto06b.swift cues.json carpeta fuente.ttf") }
let cues = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [[String: Any]]
let outDir = URL(fileURLWithPath: args[2])
CTFontManagerRegisterFontsForURL(URL(fileURLWithPath: args[3]) as CFURL, .process, nil)
guard NSFont(name: "TikTokDisplay-Medium", size: 74) != nil else { fatalError("Falta la fuente exacta 06B") }
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let w = 886, h = 318

for (i, cue) in cues.enumerated() {
  let lines = cue["lines"] as! [String]
  guard !lines.isEmpty else { fatalError("Rótulo vacío") }
  let bmp = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                             colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bmp)!
  NSGraphicsContext.current!.cgContext.setLineJoin(.round)   // sin picos en M/N/V
  NSGraphicsContext.current!.cgContext.setMiterLimit(1)
  NSColor.clear.setFill(); NSRect(x: 0, y: 0, width: w, height: h).fill()
  var size: CGFloat = 74
  func attrs() -> [NSAttributedString.Key: Any] {
    [.font: NSFont(name: "TikTokDisplay-Medium", size: size)!, .foregroundColor: NSColor.white]
  }
  func dims() -> [NSSize] { lines.map { NSAttributedString(string: $0, attributes: attrs()).size() } }
  while size > 12 {
    let d = dims(), adv = size * 35 / 31
    let fitsW = d.map { $0.width }.max()! <= CGFloat(w) - 2 * size * 0.05 - 12
    let fitsH = d.map { $0.height }.max()! + adv * CGFloat(lines.count - 1) + 2 * size * 0.05 < CGFloat(h)
    if fitsW && fitsH { break }
    size -= 1
  }
  guard size > 12 else { fatalError("El rótulo no cabe sin omitir texto") }
  let d = dims(), adv = size * 35 / 31
  let total = d.map { $0.height }.max()! + adv * CGFloat(lines.count - 1)
  for (j, line) in lines.enumerated() {
    let p = NSPoint(x: (CGFloat(w) - d[j].width) / 2, y: (CGFloat(h) + total) / 2 - d[j].height - CGFloat(j) * adv)
    var stroke = attrs(); stroke[.strokeColor] = NSColor.black; stroke[.strokeWidth] = -10.0
    NSAttributedString(string: line, attributes: stroke).draw(at: p)
    NSAttributedString(string: line, attributes: attrs()).draw(at: p)
  }
  NSGraphicsContext.restoreGraphicsState()
  try bmp.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent("cue-\(i).png"))
  print("cue \(i) size=\(size)")
}
