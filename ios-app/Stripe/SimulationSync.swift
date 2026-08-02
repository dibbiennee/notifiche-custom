import Foundation

/// L'indirizzo del server e il token, scritti una volta sola dal pannello.
///
/// Non stanno nel codice di proposito: il token finirebbe nel repository, e
/// questa app la si installa da Xcode con il proprio.
struct SyncSettings: Codable, Equatable {
    var baseURL = ""
    var token = ""

    var isConfigured: Bool {
        !baseURL.trimmingCharacters(in: .whitespaces).isEmpty
            && !token.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var endpoint: URL? {
        let trimmed = baseURL.trimmingCharacters(in: .whitespaces)
        let withScheme = trimmed.hasPrefix("http") ? trimmed : "https://\(trimmed)"
        return URL(string: withScheme.hasSuffix("/") ? "\(withScheme)api/simulation/" : "\(withScheme)/api/simulation/")
    }
}

enum SyncError: LocalizedError {
    case notConfigured
    case badResponse(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured: return "Indirizzo o token mancanti."
        case .badResponse(let code): return code == 401 ? "Token rifiutato." : "Il server ha risposto \(code)."
        }
    }
}

/// Il giro completo con il server: la stessa riga che legge e scrive la
/// dashboard nel browser. Non c'è una copia per dispositivo, quindi non c'è
/// niente da riconciliare: chi scrive per ultimo vince.
enum SimulationSync {
    private struct Envelope: Codable {
        var simulation: Simulation
    }

    static func fetch(_ settings: SyncSettings) async throws -> Simulation {
        guard settings.isConfigured, let url = settings.endpoint else { throw SyncError.notConfigured }

        var request = URLRequest(url: url)
        request.setValue("Bearer \(settings.token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        try check(response)
        return try JSONDecoder().decode(Envelope.self, from: data).simulation
    }

    static func push(_ simulation: Simulation, _ settings: SyncSettings) async throws {
        guard settings.isConfigured, let url = settings.endpoint else { throw SyncError.notConfigured }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(settings.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(simulation)

        let (_, response) = try await URLSession.shared.data(for: request)
        try check(response)
    }

    private static func check(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard (200..<300).contains(http.statusCode) else {
            throw SyncError.badResponse(http.statusCode)
        }
    }
}
