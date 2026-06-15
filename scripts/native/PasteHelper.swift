import Cocoa
import Foundation

func writeStderr(_ message: String) {
    FileHandle.standardError.write(message.data(using: .utf8)!)
}

let trusted = AXIsProcessTrusted()
if !trusted {
    writeStderr("accessibility-not-granted\n")
    exit(2)
}

guard let source = CGEventSource(stateID: .combinedSessionState) else {
    writeStderr("cgevent-source-failed\n")
    exit(3)
}

// Optional first argument selects the key to send with Command held down:
//   "c" -> Cmd+C (copy), "v" (default) -> Cmd+V (paste).
let kVK_ANSI_C: CGKeyCode = 0x08
let kVK_ANSI_V: CGKeyCode = 0x09
let requestedKey = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : "v"
let virtualKey: CGKeyCode = requestedKey == "c" ? kVK_ANSI_C : kVK_ANSI_V

guard
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: true),
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: virtualKey, keyDown: false)
else {
    writeStderr("cgevent-create-failed\n")
    exit(4)
}

keyDown.flags = .maskCommand
keyUp.flags = .maskCommand

keyDown.post(tap: .cghidEventTap)
usleep(8_000)
keyUp.post(tap: .cghidEventTap)

exit(0)
