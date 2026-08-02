import Foundation

/// Tiene la simulazione e il periodo scelto. La dashboard non è salvata: si
/// ricalcola, perché è solo una lettura di questi due valori.
@MainActor
final class DashboardStore: ObservableObject {
    @Published var simulation: Simulation {
        didSet {
            save()
            schedulePush()
        }
    }

    @Published var period: Period { didSet { save() } }
    @Published var sync: SyncSettings { didSet { save() } }

    /// L'esito dell'ultimo scambio col server, da mostrare nel pannello.
    @Published private(set) var syncMessage = ""

    /// Vero mentre il trascinamento verso il basso sta ricaricando: i riquadri
    /// si svuotano e mostrano la rotella, come nell'originale.
    @Published private(set) var isRefreshing = false

    private let simulationKey = "dashboard.simulation"
    private let periodKey = "dashboard.period"
    private let syncKey = "dashboard.sync"
    private let defaults: UserDefaults

    private var pushTask: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        if let raw = defaults.data(forKey: simulationKey),
           let decoded = try? JSONDecoder().decode(Simulation.self, from: raw) {
            simulation = decoded
        } else {
            simulation = Simulation()
        }

        period = defaults.string(forKey: periodKey).flatMap(Period.init(rawValue:)) ?? .week

        if let raw = defaults.data(forKey: syncKey),
           let decoded = try? JSONDecoder().decode(SyncSettings.self, from: raw) {
            sync = decoded
        } else {
            sync = SyncSettings()
        }
    }

    var dashboard: Dashboard {
        Dashboard(simulation: simulation, period: period)
    }

    /// Rifà tutti i numeri lasciando invariate le impostazioni. Il seme resta
    /// sotto 2^53: oltre, il giro in JSON lo arrotonderebbe e il browser
    /// genererebbe cifre diverse dalle nostre.
    func regenerate() {
        simulation.seed = UInt64.random(in: 1...9_007_199_254_740_991)
    }

    func reset() {
        simulation = Simulation()
    }

    /// Scarica le impostazioni dal server. Si chiama all'avvio: se qualcuno le
    /// ha cambiate dal browser, il telefono si allinea da solo.
    func pull() async {
        guard sync.isConfigured else { return }
        do {
            let remote = try await SimulationSync.fetch(sync)
            if remote != simulation {
                // Assegnando si farebbe partire anche un push: qui il valore
                // arriva dal server, rimandarglielo sarebbe solo rumore.
                pushTask?.cancel()
                simulation = remote
                pushTask?.cancel()
            }
            syncMessage = "Allineato col server."
        } catch {
            syncMessage = error.localizedDescription
        }
    }

    /// Il gesto di trascinamento verso il basso. Se il server c'e' ricarica da
    /// li'; se non e' configurato aspetta comunque un attimo, perche' senza
    /// attesa la rotella comparirebbe e sparirebbe nello stesso fotogramma.
    func refresh() async {
        isRefreshing = true
        if sync.isConfigured {
            await pull()
        } else {
            try? await Task.sleep(for: .milliseconds(1000))
        }
        isRefreshing = false
    }

    /// Manda le impostazioni al server, ma non a ogni tasto premuto: si aspetta
    /// che l'utente smetta di scrivere.
    private func schedulePush() {
        guard sync.isConfigured else { return }
        pushTask?.cancel()

        let current = simulation
        let settings = sync
        pushTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            do {
                try await SimulationSync.push(current, settings)
                await MainActor.run { self?.syncMessage = "Salvato sul server." }
            } catch {
                await MainActor.run { self?.syncMessage = error.localizedDescription }
            }
        }
    }

    private func save() {
        if let raw = try? JSONEncoder().encode(simulation) {
            defaults.set(raw, forKey: simulationKey)
        }
        if let raw = try? JSONEncoder().encode(sync) {
            defaults.set(raw, forKey: syncKey)
        }
        defaults.set(period.rawValue, forKey: periodKey)
    }
}
