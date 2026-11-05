import Foundation

func assertEqual<T: Equatable>(_ actual: T, _ expected: T, _ message: String = "", file: StaticString = #file, line: UInt = #line) {
    if actual != expected {
        fatalError("Assertion failed: \(actual) != \(expected). \(message) at \(file):\(line)")
    }
}

func assertTrue(_ condition: Bool, _ message: String = "", file: StaticString = #file, line: UInt = #line) {
    if !condition {
        fatalError("Assertion failed: expected true, got false. \(message) at \(file):\(line)")
    }
}

func assertFalse(_ condition: Bool, _ message: String = "", file: StaticString = #file, line: UInt = #line) {
    if condition {
        fatalError("Assertion failed: expected false, got true. \(message) at \(file):\(line)")
    }
}

func fail(_ message: String = "", file: StaticString = #file, line: UInt = #line) -> Never {
    fatalError("Test failed: \(message) at \(file):\(line)")
}
