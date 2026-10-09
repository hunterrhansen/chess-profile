// Screenshots a web page with WebKit (macOS, no browser install needed).
// Usage: snap-page <url> <width> <height> <out.png> [dark]
// The PNG is at the screen's scale (2x on Retina); see docs/screens/README.md.
import AppKit
import WebKit

let args = CommandLine.arguments
let url = URL(string: args[1])!
let w = CGFloat(Double(args[2])!), h = CGFloat(Double(args[3])!)
let out = args[4]
let dark = args.count > 5 && args[5] == "dark"

class Delegate: NSObject, WKNavigationDelegate {
    func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
        let js = dark ? "document.documentElement.setAttribute('data-theme','dark');document.querySelectorAll('[data-theme]').forEach(e=>e.setAttribute('data-theme','dark'));" : ""
        web.evaluateJavaScript(js) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                let cfg = WKSnapshotConfiguration()
                cfg.rect = CGRect(x: 0, y: 0, width: w, height: h)
                web.takeSnapshot(with: cfg) { image, err in
                    guard let image = image, let tiff = image.tiffRepresentation,
                          let rep = NSBitmapImageRep(data: tiff),
                          let png = rep.representation(using: .png, properties: [:]) else {
                        FileHandle.standardError.write("snapshot failed: \(String(describing: err))\n".data(using: .utf8)!)
                        exit(1)
                    }
                    try! png.write(to: URL(fileURLWithPath: out))
                    exit(0)
                }
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let window = NSWindow(contentRect: CGRect(x: 0, y: 0, width: w, height: h), styleMask: [.borderless], backing: .buffered, defer: false)
let web = WKWebView(frame: CGRect(x: 0, y: 0, width: w, height: h))
window.contentView = web
let delegate = Delegate()
web.navigationDelegate = delegate
web.load(URLRequest(url: url))
DispatchQueue.main.asyncAfter(deadline: .now() + 30) { FileHandle.standardError.write("timeout\n".data(using: .utf8)!); exit(2) }
app.run()
