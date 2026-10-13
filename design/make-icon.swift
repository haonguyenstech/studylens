// Renders the StudyLens app icon: swift design/make-icon.swift <out.png> [size]
// Same family as Super Agents (squircle, gradient, white glyph, sparks):
// a study page with a lens over it, and a spark for the explanation.
import AppKit

let args = CommandLine.arguments
let out = args.count > 1 ? args[1] : "icon.png"
let S = CGFloat(Double(args.count > 2 ? args[2] : "1024") ?? 1024)
let k = S / 1024

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(S), pixelsHigh: Int(S), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let ctx = NSGraphicsContext.current!.cgContext
ctx.scaleBy(x: k, y: k)
let cs = CGColorSpaceCreateDeviceRGB()
func c(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: a)
}
func grad(_ colors: [CGColor], _ locs: [CGFloat]) -> CGGradient { CGGradient(colorsSpace: cs, colors: colors as CFArray, locations: locs)! }

func squircle(_ r: CGRect, n: CGFloat = 5) -> CGPath {
    let p = CGMutablePath()
    let a = r.width / 2, b = r.height / 2, cx = r.midX, cy = r.midY
    for i in 0...720 {
        let t = CGFloat(i) / 720 * 2 * .pi
        let ct = cos(t), st = sin(t)
        let x = cx + a * (ct < 0 ? -1 : 1) * pow(abs(ct), 2 / n)
        let y = cy + b * (st < 0 ? -1 : 1) * pow(abs(st), 2 / n)
        i == 0 ? p.move(to: CGPoint(x: x, y: y)) : p.addLine(to: CGPoint(x: x, y: y))
    }
    p.closeSubpath()
    return p
}
func spark(_ center: CGPoint, _ s: CGFloat, _ waist: CGFloat) -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 0, y: s))
    p.addQuadCurve(to: CGPoint(x: s, y: 0), control: CGPoint(x: waist, y: waist))
    p.addQuadCurve(to: CGPoint(x: 0, y: -s), control: CGPoint(x: waist, y: -waist))
    p.addQuadCurve(to: CGPoint(x: -s, y: 0), control: CGPoint(x: -waist, y: -waist))
    p.addQuadCurve(to: CGPoint(x: 0, y: s), control: CGPoint(x: -waist, y: waist))
    var t = CGAffineTransform(translationX: center.x, y: center.y)
    return p.copy(using: &t)!
}

let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let shape = squircle(tile)

ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -12), blur: 30, color: c(0x000000, 0.32))
ctx.addPath(shape); ctx.setFillColor(c(0x111111)); ctx.fillPath()
ctx.restoreGState()

ctx.saveGState()
ctx.addPath(shape); ctx.clip()
// Cool daylight: teal → blue → indigo.
ctx.drawLinearGradient(grad([c(0x3FD8C2), c(0x3A86F5), c(0x5B4BE0)], [0, 0.5, 1]),
                       start: CGPoint(x: 160, y: 900), end: CGPoint(x: 860, y: 120), options: [])
ctx.drawRadialGradient(grad([c(0xFFFFFF, 0.24), c(0xFFFFFF, 0)], [0, 1]),
                       startCenter: CGPoint(x: 300, y: 820), startRadius: 0,
                       endCenter: CGPoint(x: 300, y: 820), endRadius: 520, options: [])

// Page
let page = CGRect(x: 248, y: 268, width: 380, height: 490)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: c(0x14205C, 0.40))
ctx.addPath(CGPath(roundedRect: page, cornerWidth: 54, cornerHeight: 54, transform: nil))
ctx.setFillColor(c(0xFFFFFF)); ctx.fillPath()
ctx.restoreGState()
// Text lines on the page; the second one is the "link" (accent + dotted)
let lines: [(CGFloat, CGFloat, UInt32)] = [(650, 250, 0xB9C3DA), (566, 290, 0x3A86F5), (482, 210, 0xB9C3DA), (398, 160, 0xB9C3DA)]
for (y, w, col) in lines {
    ctx.addPath(CGPath(roundedRect: CGRect(x: 312, y: y, width: w, height: 34), cornerWidth: 17, cornerHeight: 17, transform: nil))
    ctx.setFillColor(c(col)); ctx.fillPath()
}
for i in 0..<7 {
    ctx.addEllipse(in: CGRect(x: 314 + CGFloat(i) * 42, y: 530, width: 14, height: 14))
}
ctx.setFillColor(c(0x3A86F5)); ctx.fillPath()

// Lens over the page corner
let lc = CGPoint(x: 612, y: 418), lr: CGFloat = 132
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 28, color: c(0x14205C, 0.45))
ctx.addEllipse(in: CGRect(x: lc.x - lr, y: lc.y - lr, width: lr * 2, height: lr * 2))
ctx.setFillColor(c(0xFFFFFF, 0.28)); ctx.fillPath()
ctx.addEllipse(in: CGRect(x: lc.x - lr, y: lc.y - lr, width: lr * 2, height: lr * 2))
ctx.setLineWidth(58); ctx.setStrokeColor(c(0xFFFFFF)); ctx.strokePath()
ctx.move(to: CGPoint(x: lc.x + lr * 0.74, y: lc.y - lr * 0.74))
ctx.addLine(to: CGPoint(x: 820, y: 210))
ctx.setLineWidth(74); ctx.setLineCap(.round); ctx.strokePath()
ctx.restoreGState()

// Sparks: the explanation popping out
ctx.addPath(spark(CGPoint(x: 760, y: 700), 92, 12)); ctx.setFillColor(c(0xFFFFFF)); ctx.fillPath()
ctx.addPath(spark(CGPoint(x: 820, y: 560), 40, 6)); ctx.setFillColor(c(0xFFFFFF, 0.85)); ctx.fillPath()
ctx.addPath(spark(CGPoint(x: 680, y: 800), 24, 4)); ctx.setFillColor(c(0xFFFFFF, 0.6)); ctx.fillPath()

ctx.drawLinearGradient(grad([c(0xFFFFFF, 0.14), c(0xFFFFFF, 0)], [0, 1]),
                       start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 600), options: [])
ctx.restoreGState()
ctx.addPath(shape); ctx.setLineWidth(3); ctx.setStrokeColor(c(0xFFFFFF, 0.16)); ctx.strokePath()

NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: out))
