import SwiftUI
import UserNotifications

struct ContentView: View {
    @State private var text = "You received a payment of €\(AMOUNT_PLACEHOLDER) EUR"
    @State private var selected: Set<String> = ["1890.00"]
    @State private var custom = ""

    @State private var delay = 10.0
    @State private var multiple = false
    @State private var limitByCount = true
    @State private var count = 20.0
    @State private var duration = 5.0
    @State private var fixedCadence = true
    @State private var cadence = 30.0
    @State private var randomMin = 5.0
    @State private var randomMax = 40.0

    @State private var message = ""
    @State private var isError = false

    private var amounts: [String] {
        var out = PRESET_AMOUNTS.filter { selected.contains($0) }
        let trimmed = custom.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
        if !trimmed.isEmpty, Double(trimmed) != nil { out.append(trimmed) }
        return out
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Testo") {
                    TextField("Testo", text: $text, axis: .vertical).lineLimit(2...4)
                    Text("Dove scrivi \(AMOUNT_PLACEHOLDER) finisce la cifra.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                Section("Importo") {
                    ForEach(PRESET_AMOUNTS, id: \.self) { amount in
                        Button {
                            if selected.contains(amount) { selected.remove(amount) } else { selected.insert(amount) }
                        } label: {
                            HStack {
                                Text("€\(amount) EUR")
                                Spacer()
                                if selected.contains(amount) { Image(systemName: "checkmark") }
                            }
                        }
                        .tint(.primary)
                    }
                    TextField("altro importo", text: $custom).keyboardType(.decimalPad)
                }

                Section("Quando parte") {
                    Stepper("Tra \(Int(delay)) secondi", value: $delay, in: 0...3600, step: 5)
                }

                Section("Quante") {
                    Toggle("Piu' di una", isOn: $multiple)
                    if multiple {
                        Picker("Limite", selection: $limitByCount) {
                            Text("Numero").tag(true)
                            Text("Periodo").tag(false)
                        }.pickerStyle(.segmented)

                        if limitByCount {
                            Stepper("\(Int(count)) notifiche", value: $count, in: 1...64, step: 1)
                        } else {
                            Stepper("Per \(Int(duration)) minuti", value: $duration, in: 1...120, step: 1)
                        }
                    }
                }

                if multiple {
                    Section("Ogni quanto") {
                        Picker("Cadenza", selection: $fixedCadence) {
                            Text("Fissa").tag(true)
                            Text("A caso").tag(false)
                        }.pickerStyle(.segmented)

                        if fixedCadence {
                            Stepper("Ogni \(Int(cadence)) secondi", value: $cadence, in: 1...3600, step: 1)
                        } else {
                            Stepper("Da \(Int(randomMin)) secondi", value: $randomMin, in: 1...3600, step: 1)
                            Stepper("A \(Int(randomMax)) secondi", value: $randomMax, in: 1...3600, step: 1)
                        }
                    }
                }

                Section {
                    Button("Invia", action: send).frame(maxWidth: .infinity)
                    if !message.isEmpty {
                        Text(message).foregroundStyle(isError ? .red : .green).font(.callout)
                    }
                    Button("Annulla tutte", role: .destructive) {
                        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
                        show("Programmazioni annullate.", error: false)
                    }
                }
            }
            .navigationTitle("Stripe")
            .task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) }
        }
    }

    private func show(_ m: String, error: Bool) {
        message = m
        isError = error
    }

    private func send() {
        if text.contains(AMOUNT_PLACEHOLDER) && amounts.isEmpty {
            show("Il testo contiene \(AMOUNT_PLACEHOLDER) ma non hai scelto nessun importo.", error: true)
            return
        }

        let limit: Limit = limitByCount ? .count(Int(count)) : .duration(duration * 60)
        let cad: Cadence = fixedCadence ? .fixed(cadence) : .random(min: randomMin, max: randomMax)

        let offsets: [TimeInterval]
        do {
            offsets = multiple
                ? try computeOffsets(startDelay: delay, limit: limit, cadence: cad)
                : [delay]
        } catch {
            show(error.localizedDescription, error: true)
            return
        }

        let center = UNUserNotificationCenter.current()
        for offset in offsets {
            let content = UNMutableNotificationContent()
            // Solo il corpo: il nome dell'app lo mette iOS nell'intestazione.
            content.body = amounts.isEmpty ? text : renderBody(text, amount: pickAmount(amounts) ?? "")
            content.sound = .default

            // Il trigger vuole un intervallo strettamente positivo.
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, offset), repeats: false)
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: trigger))
        }

        show("Programmate \(offsets.count). Blocca lo schermo.", error: false)
    }
}
