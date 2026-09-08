import SwiftUI

/// Le impostazioni della simulazione. Non ci sono piu' totali, date o valori
/// del grafico da scrivere: quelli si calcolano, ed e' il motivo per cui non
/// possono piu' contraddirsi fra loro.
struct DashboardEditor: View {
    @EnvironmentObject private var store: DashboardStore

    /// Il campo "Aim for" fissa l'incasso sulla data di oggi, non su "oggi"
    /// inteso come posizione: domani quello che scrivi adesso resta su oggi.
    private var oggi: String { Simulation.dateKey(Simulation.date(at: 0)) }
    @Environment(\.dismiss) private var dismiss

    /// Gli stessi importi che si scelgono per le notifiche.
    private let preset = PRESET_AMOUNTS.compactMap(Double.init)

    @State private var customAmount = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Header") {
                    LabeledContent("Name") {
                        TextField("Business name", text: $store.simulation.merchantName)
                            .multilineTextAlignment(.trailing)
                    }
                    Menu("Suggested names") {
                        ForEach(Simulation.suggestedNames, id: \.self) { name in
                            Button(name) { store.simulation.merchantName = name }
                        }
                    }

                    Picker("Currency", selection: $store.simulation.currency) {
                        ForEach(Simulation.Currency.allCases) { Text($0.title).tag($0) }
                    }
                }

                Section {
                    DecimalField("From", value: $store.simulation.dailyMin)
                    DecimalField("To", value: $store.simulation.dailyMax)
                } header: {
                    Text("Daily revenue")
                } footer: {
                    Text("Each day picks a random amount in this range. Everything else follows: both period totals, the charts and the band at the top.")
                }

                Section {
                    DecimalField(
                        "Aim for",
                        value: Binding(
                            get: { store.simulation.dayTargets?[oggi] ?? 0 },
                            set: { importo in
                                var mappa = store.simulation.dayTargets ?? [:]
                                if importo > 0 { mappa[oggi] = importo } else { mappa[oggi] = nil }
                                store.simulation.dayTargets = mappa.isEmpty ? nil : mappa
                            }
                        )
                    )
                    if store.simulation.dayTargets?[oggi] != nil {
                        Button("Back to random") {
                            var mappa = store.simulation.dayTargets ?? [:]
                            mappa[oggi] = nil
                            store.simulation.dayTargets = mappa.isEmpty ? nil : mappa
                        }
                    }
                } header: {
                    Text("Today only")
                } footer: {
                    Text("At zero, today is random like every other day. With an amount, the day fills with payments until they no longer fit under it, so the total lands just below — the prices are what they are. The amount stays on today's date: tomorrow it is still there, on yesterday.")
                }

                Section {
                    Toggle("Send them by themselves", isOn: $store.auto.enabled)
                    if store.auto.enabled {
                        Stepper("\(store.auto.perDay) a day", value: $store.auto.perDay, in: 1...40)
                        Stepper("\(store.auto.daysAhead) days ahead", value: $store.auto.daysAhead, in: 1...7)
                        TextField("Text", text: $store.auto.template)
                        LabeledContent("Queued now", value: "\(min(56, store.auto.budget))")
                    }
                } header: {
                    Text("Automatic notifications")
                } footer: {
                    Text("They are not made up: they are the payments of the dashboard, at the hour the chart says they came in. Only a sample of them — iOS keeps at most 64 local notifications queued per app, and a day has far more payments than that. They are re-armed every time you open the app or pull to refresh, so keep the app in your habits or the queue runs dry.")
                }

                Section {
                    ForEach(preset, id: \.self) { amount in
                        Button {
                            toggle(amount)
                        } label: {
                            HStack {
                                Text(money(amount, symbol: store.simulation.currency.reportSymbol))
                                Spacer()
                                if store.simulation.paymentAmounts.contains(amount) {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                        .tint(.primary)
                    }

                    HStack {
                        TextField("another amount", text: $customAmount)
                            .keyboardType(.decimalPad)
                        Button("Add") {
                            if let value = parseDecimal(customAmount), value > 0 {
                                toggle(value)
                                customAmount = ""
                            }
                        }
                        .disabled(parseDecimal(customAmount).map { $0 <= 0 } ?? true)
                    }

                    ForEach(extra, id: \.self) { amount in
                        Button {
                            toggle(amount)
                        } label: {
                            HStack {
                                Text(money(amount, symbol: store.simulation.currency.reportSymbol))
                                Spacer()
                                Image(systemName: "checkmark")
                            }
                        }
                        .tint(.primary)
                    }
                } header: {
                    Text("Payment amounts")
                } footer: {
                    Text("The cheapest is the entry product, the others are upsells. This is why payment and customer counts always add up to the revenue.")
                }

                Section {
                    DecimalField("Net lower by %", value: $store.simulation.netDeductionPercent)
                } header: {
                    Text("Net")
                } footer: {
                    Text("How far \"Net volume from sales\" sits below gross.")
                }

                Section {
                    DecimalField(
                        "Da",
                        value: Binding(
                            get: { store.simulation.repeatMinPercent ?? 40 },
                            set: { store.simulation.repeatMinPercent = $0 }
                        )
                    )
                    DecimalField(
                        "A",
                        value: Binding(
                            get: { store.simulation.repeatMaxPercent ?? 80 },
                            set: { store.simulation.repeatMaxPercent = $0 }
                        )
                    )
                } header: {
                    Text("Upsell rate, in percent")
                } footer: {
                    Text("Every customer buys the cheapest product; this is the share that also takes a pricier one. It changes daily within the range, so payments and customers never stay in a fixed ratio — that would be the first thing to give made-up numbers away.")
                }

                Section {
                    LabeledContent("In business for") {
                        Text("\(store.simulation.businessDays) days")
                            .foregroundStyle(.secondary)
                    }
                    Stepper(
                        "Days",
                        value: $store.simulation.businessDays,
                        in: 7...3650,
                        step: 30
                    )
                    .labelsHidden()
                } header: {
                    Text("History")
                } footer: {
                    Text("Only used by the ALL range, which covers the whole life of the business.")
                }

                Section {
                    anteprima
                } header: {
                    Text("How today turns out")
                }

                Section {
                    LabeledContent("Address") {
                        TextField("notifiche-custom.vercel.app", text: $store.sync.baseURL)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    LabeledContent("Token") {
                        SecureField("APP_TOKEN", text: $store.sync.token)
                            .multilineTextAlignment(.trailing)
                    }
                    Button("Fetch from server") {
                        Task { await store.pull() }
                    }
                    .disabled(!store.sync.isConfigured)

                    if !store.syncMessage.isEmpty {
                        Text(store.syncMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Sync")
                } footer: {
                    Text("The same settings as the dashboard in the browser. Every change is sent after a moment; on launch the app fetches whatever the server has.")
                }

                Section {
                    Button("Regenerate the numbers") { store.regenerate() }
                    Button("Reset settings", role: .destructive) { store.reset() }
                } footer: {
                    Text("Regenerate changes every figure while keeping the ranges you set.")
                }
            }
            .navigationTitle("Simulation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    /// Il riepilogo serve a vedere subito l'effetto di una modifica, senza
    /// chiudere il form.
    private var anteprima: some View {
        let simulation = store.simulation
        let oggi = simulation.day(0)
        let dashboard = store.dashboard
        let symbol = simulation.currency.reportSymbol

        return Group {
            LabeledContent("Revenue today", value: money(oggi.gross, symbol: symbol))
            LabeledContent("Payments", value: String(oggi.paymentCount))
            LabeledContent("Customers", value: String(simulation.customerCount(oggi)))
            if let gross = dashboard.reports.first {
                LabeledContent("\(store.period.rawValue) total", value: money(gross.currentTotal, symbol: symbol))
                LabeledContent("Change", value: gross.delta.map(percent) ?? "—")
            }
        }
        .foregroundStyle(.secondary)
    }

    /// Gli importi aggiunti a mano, cioe' quelli scelti che non stanno fra i
    /// preset.
    private var extra: [Double] {
        store.simulation.paymentAmounts.filter { !preset.contains($0) }.sorted()
    }

    private func toggle(_ amount: Double) {
        if let index = store.simulation.paymentAmounts.firstIndex(of: amount) {
            // L'ultimo non si toglie: senza importi non ci sarebbero pagamenti
            // e la dashboard resterebbe a zero.
            if store.simulation.paymentAmounts.count > 1 {
                store.simulation.paymentAmounts.remove(at: index)
            }
        } else {
            store.simulation.paymentAmounts.append(amount)
        }
    }
}

/// Un campo numerico con l'etichetta a sinistra.
private struct DecimalField: View {
    let title: String
    @Binding var value: Double

    init(_ title: String, value: Binding<Double>) {
        self.title = title
        _value = value
    }

    var body: some View {
        LabeledContent(title) {
            DecimalInput(value: $value)
        }
    }
}

/// Il campo nudo. Tiene una copia in testo perche' mentre si digita "1." il
/// numero non esiste ancora: convertire a ogni tasto cancellerebbe quello che
/// si sta scrivendo.
private struct DecimalInput: View {
    @Binding var value: Double

    @State private var text: String

    init(value: Binding<Double>) {
        _value = value
        _text = State(initialValue: value.wrappedValue == 0 ? "" : decimalText(value.wrappedValue))
    }

    var body: some View {
        TextField("0", text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .onChange(of: text) { _, new in
                if let parsed = parseDecimal(new) { value = parsed }
            }
    }
}
