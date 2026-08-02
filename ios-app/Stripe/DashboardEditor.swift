import SwiftUI

/// Il form che riscrive la dashboard. Non ha un tasto "salva": ogni modifica
/// va a segno subito, e "Fine" chiude e basta.
struct DashboardEditor: View {
    @EnvironmentObject private var store: DashboardStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Intestazione") {
                    LabeledContent("Nome") {
                        TextField("Nome dell'attivita'", text: $store.data.merchantName)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Titolo") {
                        TextField("Today", text: $store.data.todayTitle)
                            .multilineTextAlignment(.trailing)
                    }
                }

                Section {
                    ForEach($store.data.pages) { $page in
                        NavigationLink {
                            StatPageEditor(page: $page)
                        } label: {
                            Text(page.items.map(\.label).joined(separator: " · "))
                                .lineLimit(1)
                        }
                    }
                    .onDelete { store.data.pages.remove(atOffsets: $0) }

                    Button("Aggiungi pagina") {
                        store.data.pages.append(.empty())
                    }
                } header: {
                    Text("Fascia del giorno")
                } footer: {
                    Text("Ogni pagina e' una schermata del carosello. I valori sono testo libero: ci puoi scrivere un importo o un conteggio.")
                }

                Section {
                    ForEach($store.data.reports) { $report in
                        NavigationLink {
                            ReportEditor(
                                report: $report,
                                sourceTitle: store.data.sourceTitle(for: report),
                                resolved: store.data.resolved(report)
                            )
                        } label: {
                            LabeledContent(report.title, value: money(store.data.resolved(report).currentTotal))
                        }
                    }
                    .onDelete { store.data.reports.remove(atOffsets: $0) }
                    .onMove { store.data.reports.move(fromOffsets: $0, toOffset: $1) }

                    Button("Aggiungi report") {
                        store.data.reports.append(.empty())
                    }
                } header: {
                    Text("Reports")
                }

                Section {
                    Button("Ripristina i dati di esempio", role: .destructive) {
                        store.reset()
                    }
                }
            }
            .navigationTitle("Dashboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fine") { dismiss() }
                }
            }
        }
    }
}

/// Le tre cifre di una pagina del carosello.
private struct StatPageEditor: View {
    @Binding var page: StatPage

    var body: some View {
        Form {
            ForEach($page.items) { $item in
                Section {
                    LabeledContent("Etichetta") {
                        TextField("Gross volume", text: $item.label)
                            .multilineTextAlignment(.trailing)
                    }
                    LabeledContent("Valore") {
                        TextField("US$0.00", text: $item.value)
                            .multilineTextAlignment(.trailing)
                    }
                }
            }
            .onDelete { page.items.remove(atOffsets: $0) }

            Section {
                Button("Aggiungi cifra") {
                    page.items.append(StatItem(label: "Etichetta", value: "0"))
                }
            } footer: {
                Text("Nella fascia ci stanno bene tre cifre. Oltre, il testo si rimpicciolisce per rientrare.")
            }
        }
        .navigationTitle("Pagina")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// Un report: i due totali, i due intervalli di date e le due serie di valori.
private struct ReportEditor: View {
    @Binding var report: Report
    let sourceTitle: String?
    let resolved: Report

    var body: some View {
        Form {
            Section("Titolo") {
                TextField("Gross volume", text: $report.title)
            }

            if let sourceTitle {
                derivedSections(sourceTitle: sourceTitle)
            } else {
                ownSections
            }
        }
        .navigationTitle(report.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Le due serie devono avere la stessa lunghezza: se un salvataggio
            // vecchio le ha lasciate diverse, qui si rimettono in riga.
            if report.previousSeries.count != report.currentSeries.count {
                report.resize(to: rowCount)
            }
        }
    }

    /// Un report agganciato a un altro non ha numeri propri da mostrare: si
    /// regola solo di quanto scende rispetto alla sorgente.
    @ViewBuilder
    private func derivedSections(sourceTitle: String) -> some View {
        Section {
            LabeledContent("Sorgente", value: sourceTitle)
            DecimalField("Sconto %", value: $report.deductionPercent)

            Button("Scollega e rendi modificabile") {
                report.previousTotal = resolved.previousTotal
                report.currentTotal = resolved.currentTotal
                report.previousSeries = resolved.previousSeries
                report.currentSeries = resolved.currentSeries
                report.previousRange = resolved.previousRange
                report.currentRange = resolved.currentRange
                report.derivedFrom = nil
            }
        } header: {
            Text("Calcolato")
        } footer: {
            Text("Questo report non si scrive: e' \(sourceTitle) meno lo sconto. Cambia i numeri li' sopra e qui seguono da soli, grafico compreso.")
        }

        Section("Risultato") {
            LabeledContent("Totale precedente", value: money(resolved.previousTotal))
            LabeledContent("Totale corrente", value: money(resolved.currentTotal))
            LabeledContent("Variazione", value: resolved.delta.map(percent) ?? "—")
        }
        .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private var ownSections: some View {
            Section {
                DecimalField("Totale", value: $report.previousTotal)
                LabeledContent("Date") {
                    TextField("19 Jul – 25 Jul 2026", text: $report.previousRange)
                        .multilineTextAlignment(.trailing)
                }
                Button("Usa la somma dei valori") {
                    report.previousTotal = report.previousSeries.reduce(0, +)
                }
            } header: {
                Text("Periodo precedente")
            }

            Section {
                DecimalField("Totale", value: $report.currentTotal)
                LabeledContent("Date") {
                    TextField("26 Jul – Today", text: $report.currentRange)
                        .multilineTextAlignment(.trailing)
                }
                Button("Usa la somma dei valori") {
                    report.currentTotal = report.currentSeries.reduce(0, +)
                }
            } header: {
                Text("Periodo corrente")
            }

            Section {
                LabeledContent("Variazione", value: report.delta.map(percent) ?? "—")
            } footer: {
                Text("La pastiglia colorata non si scrive: e' il rapporto fra i due totali. Rossa se il corrente e' piu' basso.")
            }

            Section {
                Stepper(
                    "\(rowCount) rilevazioni",
                    value: Binding(get: { rowCount }, set: { report.resize(to: $0) }),
                    in: 2...31
                )

                ForEach(0..<rowCount, id: \.self) { index in
                    HStack(spacing: 10) {
                        Text("\(index + 1)")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .frame(width: 18, alignment: .leading)

                        DecimalInput(value: $report.previousSeries[index], placeholder: "prec.")
                        DecimalInput(value: $report.currentSeries[index], placeholder: "corr.")
                    }
                }
            } header: {
                Text("Valori del grafico")
            } footer: {
                Text("A sinistra la spezzata grigia, a destra quella viola. Le etichette sul grafico escono da qui: massimo, minimo e punto finale sono calcolati.")
            }
    }

    private var rowCount: Int {
        min(report.previousSeries.count, report.currentSeries.count)
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
            DecimalInput(value: $value, placeholder: "0")
        }
    }
}

/// Il campo nudo. Tiene una copia in testo perche' mentre si digita "1." o
/// "-" il numero non esiste ancora: convertire a ogni tasto cancellerebbe
/// quello che si sta scrivendo.
private struct DecimalInput: View {
    @Binding var value: Double
    let placeholder: String

    @State private var text: String

    init(value: Binding<Double>, placeholder: String) {
        _value = value
        self.placeholder = placeholder
        // Lo zero si mostra come campo vuoto: quasi tutti i valori partono da
        // zero, e trovarselo scritto significherebbe cancellarlo ogni volta.
        _text = State(initialValue: value.wrappedValue == 0 ? "" : decimalText(value.wrappedValue))
    }

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .onChange(of: text) { _, new in
                if let parsed = parseDecimal(new) { value = parsed }
            }
    }
}
