import Foundation

/// Tiene i dati della dashboard e li scrive su disco a ogni modifica. Il
/// salvataggio e' immediato di proposito: il form non ha un tasto "salva", e
/// quello che si vede deve restare anche chiudendo l'app.
@MainActor
final class DashboardStore: ObservableObject {
    @Published var data: DashboardData {
        didSet { save() }
    }

    private let key = "dashboard.data"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let raw = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(DashboardData.self, from: raw) {
            data = decoded
        } else {
            data = .mock
        }
    }

    /// Rimette i numeri dello screenshot di riferimento.
    func reset() {
        data = .mock
    }

    private func save() {
        guard let raw = try? JSONEncoder().encode(data) else { return }
        defaults.set(raw, forKey: key)
    }
}
