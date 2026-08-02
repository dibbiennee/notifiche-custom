import Foundation

/// Tiene la simulazione e il periodo scelto, e li salva a ogni modifica. La
/// dashboard non e' salvata: si ricalcola, perche' e' solo una lettura di
/// questi due valori.
@MainActor
final class DashboardStore: ObservableObject {
    @Published var simulation: Simulation { didSet { save() } }
    @Published var period: Period { didSet { save() } }

    private let simulationKey = "dashboard.simulation"
    private let periodKey = "dashboard.period"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let raw = defaults.data(forKey: simulationKey),
           let decoded = try? JSONDecoder().decode(Simulation.self, from: raw) {
            simulation = decoded
        } else {
            simulation = Simulation()
        }

        period = defaults.string(forKey: periodKey).flatMap(Period.init(rawValue:)) ?? .week
    }

    var dashboard: Dashboard {
        Dashboard(simulation: simulation, period: period)
    }

    /// Rifa' tutti i numeri lasciando invariate le impostazioni.
    func regenerate() {
        simulation.seed = UInt64.random(in: 1...UInt64.max)
    }

    func reset() {
        simulation = Simulation()
    }

    private func save() {
        if let raw = try? JSONEncoder().encode(simulation) {
            defaults.set(raw, forKey: simulationKey)
        }
        defaults.set(period.rawValue, forKey: periodKey)
    }
}
