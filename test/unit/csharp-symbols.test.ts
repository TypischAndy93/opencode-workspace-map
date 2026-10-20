import { describe, it, expect } from "vitest"
import { collectSymbols } from "../../src/summarizers/summarize-utils.ts"
import { CSHARP_SYMBOL_RULES } from "../../src/summarizers/languages/csharp.ts"
import { SWIFT_DART_SYMBOL_RULES } from "../../src/summarizers/languages/swift-dart.ts"

describe("C# symbol extraction", () => {
  it("extracts namespaces", () => {
    const lines = ["namespace MyApp.Services", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "MyApp.Services")?.kind).toBe("namespace")
  })

  it("extracts classes", () => {
    const lines = ["public class UserService", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "UserService")?.kind).toBe("class")
  })

  it("extracts interfaces", () => {
    const lines = ["public interface IRepository", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "IRepository")?.kind).toBe("interface")
  })

  it("extracts enums", () => {
    const lines = ["public enum UserStatus", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "UserStatus")?.kind).toBe("enum")
  })

  it("extracts records", () => {
    const lines = ["public record UserDto", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "UserDto")?.kind).toBe("class")
  })

  it("extracts methods", () => {
    const lines = ["public string Authenticate(string email)", "}", ""]
    const { locals } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "Authenticate")?.kind).toBe("method")
  })

  it("extracts async methods", () => {
    const lines = ["public async Task<int> GetCountAsync()", "}", ""]
    const { locals } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "GetCountAsync")?.kind).toBe("method")
  })

  it("extracts properties", () => {
    const lines = ["public string Name { get; set; }", ""]
    const { locals } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "Name")?.kind).toBe("property")
  })

  it("extracts using directives", () => {
    const lines = ["using System.Collections.Generic;", ""]
    const { locals } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "System.Collections.Generic")?.kind).toBe("module")
  })

  it("handles abstract classes", () => {
    const lines = ["public abstract class BaseEntity", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "BaseEntity")?.kind).toBe("class")
  })

  it("handles sealed static classes", () => {
    const lines = ["public sealed static class Constants", "}", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "Constants")?.kind).toBe("class")
  })

  it("deduplicates symbols", () => {
    const lines = ["public class UserService", "public class UserService", ""]
    const { exports } = collectSymbols(lines, CSHARP_SYMBOL_RULES)
    expect(exports.filter((e) => e.name === "UserService").length).toBe(1)
  })
})

describe("Swift/Dart symbol extraction", () => {
  it("extracts Swift functions", () => {
    const lines = ["public func authenticate()", "}", ""]
    const { exports } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "authenticate")?.kind).toBe("function")
  })

  it("extracts Dart classes", () => {
    const lines = ["class UserService", "}", ""]
    const { exports } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "UserService")?.kind).toBe("class")
  })

  it("extracts Dart mixins", () => {
    const lines = ["mixin ValidationMixin", "}", ""]
    const { exports } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "ValidationMixin")?.kind).toBe("class")
  })

  it("extracts Dart typedefs", () => {
    const lines = ["typedef JsonMap = Map<String, dynamic>;", ""]
    const { exports } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "JsonMap")?.kind).toBe("type")
  })

  it("extracts Swift protocols", () => {
    const lines = ["protocol NetworkService", "}", ""]
    const { exports } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(exports.find((e) => e.name === "NetworkService")?.kind).toBe("interface")
  })

  it("extracts Dart getters with return type", () => {
    const lines = ["String get name => _name;", ""]
    const { locals } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "name")?.kind).toBe("property")
  })

  it("extracts Dart setters", () => {
    const lines = ["set name(String value) { _name = value; }", ""]
    const { locals } = collectSymbols(lines, SWIFT_DART_SYMBOL_RULES)
    expect(locals.find((e) => e.name === "name")?.kind).toBe("property")
  })
})
