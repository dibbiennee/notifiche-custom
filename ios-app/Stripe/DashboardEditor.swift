import SwiftUI

/// Le impostazioni della simulazione. Non ci sono piu' totali, date o valori
/// del grafico da scrivere: quelli si calcolano, ed e' il motivo per cui non
/// possono piu' contraddirsi fra loro.
struct DashboardEditor: View {
    @EnvironmentObject private var store: DashboardStore
    @Environment(\.dismiss) private var dismiss

    /// Gli stessi importi che si scelgono per le notifiche.
    private let preset = PRESET_AMOUNTS.compactMap(Double.init)

    @State private var customAmount = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Intestazione") {
                    LabeledContent("Nome") {
                        TextField("Nome dell'attivita'", text: $store.simulation.merchantName)
                            .multilineTextAlignment(.trailing)
                    }
                    Menu("Nomi pronti") {
                        ForEach(Simulation.suggestedNames, id: \.self) { name in
                            Button(name) { store.simulation.merchantName = name }
                        }
                    }

                    Picker("Valuta", selection: $store.simulation.currency) {
                        ForEach(Simulation.Currency.allCases) { Text($0.title).tag($0) }
                    }
                }

                Section {
                    DecimalField("Da", value: $store.simulation.dailyMin)
                    DecimalField("A", value: $store.simulation.dailyMax)
                } header: {
                    Text("Incasso al giorno")
                } footer: {
                    Text("Ogni giornata pesca un importo a caso in questo intervallo. Da qui escono i totali dei due periodi, il grafico e la fascia in alto.")
                }

                Section {
                    DecimalField(
                        "Punta a",
                        value: Binding(
                            get: { store.simulation.todayTarget ?? 0 },
                            set: { store.simulation.todayTarget = $0 > 0 ? $0 : nil }
                        )
                    )
                    if store.simulation.todayTarget != nil {
                        Button("Torna al caso") { store.simulation.todayTarget = nil }
                    }
                } header: {
                    Text("Solo oggi")
                } footer: {
                    Text("A zero, oggi e' casuale come gli altri giorni. Mettendo una cifra, la giornata si riempie di pagamenti fino a quanto ci sta sotto quella soglia: il totale finisce appena sotto, perche' i tagli sono quelli che sono. Gli altri giorni non cambiano, quindi la settimana si aggiorna da sola.")
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
                        TextField("altro importo", text: $customAmount)
                            .keyboardType(.decimalPad)
                        Button("Aggiungi") {
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
                    Text("Importi dei pagamenti")
                } footer: {
                    Text("La giornata si riempie sommando questi importi. E' anche il motivo per cui il numero di pagamenti e di clienti torna sempre con l'incasso.")
                }

                Section {
                    DecimalField("Netto piu' basso del", value: $store.simulation.netDeductionPercent)
                } header: {
                    Text("Netto")
                } footer: {
                    Text("Quanto \"Net volume from sales\" scende rispetto al lordo.")
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
                    Text("Upsell, in percentuale")
                } footer: {
                    Text("Ogni cliente compra il prodotto piu' economico; questa e' la quota che aggiunge anche quello piu' caro. Cambia ogni giorno dentro l'intervallo, cosi' pagamenti e clienti non restano nella stessa proporzione: sarebbe la cosa che tradisce subito dei numeri inventati.")
                }

                Section {
                    LabeledContent("Attivita' aperta da") {
                        Text("\(store.simulation.businessDays) giorni")
                            .foregroundStyle(.secondary)
                    }
                    Stepper(
                        "Giorni",
                        value: $store.simulation.businessDays,
                        in: 7...3650,
                        step: 30
                    )
                    .labelsHidden()
                } header: {
                    Text("Storico")
                } footer: {
                    Text("Serve solo al periodo ALL, che copre tutta la vita dell'attivita'.")
                }

                Section {
                    anteprima
                } header: {
                    Text("Come viene oggi")
                }

                Section {
                    LabeledContent("Indirizzo") {
                        TextField("notifiche-custom.vercel.app", text: $store.sync.baseURL)
                            .multilineTextAlignment(.trailing)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                    }
                    LabeledContent("Token") {
                        SecureField("APP_TOKEN", text: $store.sync.token)
                            .multilineTextAlignment(.trailing)
                    }
                    Button("Scarica dal server") {
                        Task { await store.pull() }
                    }
                    .disabled(!store.sync.isConfigured)

                    if !store.syncMessage.isEmpty {
                        Text(store.syncMessage)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Sincronizzazione")
                } footer: {
                    Text("Le stesse impostazioni della dashboard nel browser. Ogni modifica parte da sola dopo un attimo; all'avvio l'app scarica quelle del server.")
                }

                Section {
                    Button("Rigenera i numeri") { store.regenerate() }
                    Button("Ripristina le impostazioni", role: .destructive) { store.reset() }
                } footer: {
                    Text("Rigenera cambia tutte le cifre lasciando gli intervalli come li hai messi.")
                }
            }
            .navigationTitle("Simulazione")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { dismiss() }
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
            LabeledContent("Incasso di oggi", value: money(oggi.gross, symbol: symbol))
            LabeledContent("Pagamenti", value: String(oggi.paymentCount))
            LabeledContent("Clienti", value: String(simulation.customerCount(oggi)))
            if let gross = dashboard.reports.first {
                LabeledContent("Totale \(store.period.rawValue)", value: money(gross.currentTotal, symbol: symbol))
                LabeledContent("Variazione", value: gross.delta.map(percent) ?? "—")
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
