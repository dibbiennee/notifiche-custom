import SwiftUI

/// La home: intestazione fissa, fascia "Today" scorrevole in orizzontale e i
/// riquadri di "Reports overview" uno sotto l'altro.
struct DashboardView: View {
    @EnvironmentObject private var store: DashboardStore
    @State private var showComposer = false
    @State private var showEditor = false

    /// Quanto e' stata tirata giu' la lista. Serve perche' l'anello deve
    /// vedersi gia' mentre trascini, non solo dopo aver mollato: negli
    /// screenshot di riferimento compare a meta' gesto, col dito ancora giu'.
    @State private var pull: CGFloat = 0

    /// Vero quando il trascinamento ha superato la soglia: al rilascio parte
    /// la ricarica.
    @State private var armed = false

    /// Oltre questo il gesto conta come richiesta di ricaricare.
    private let pullThreshold: CGFloat = 80

    /// Di quanto resta giu' il contenuto mentre ricarica. Misurato sugli
    /// screenshot: fra i 60 e i 90pt.
    private let holdHeight: CGFloat = 68

    private var data: Dashboard { store.dashboard }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Mentre ricarica il contenuto resta abbassato, come
                    // faceva il controllo di sistema.
                    Color.clear
                        .frame(height: store.isRefreshing ? holdHeight : 0)

                    Text("Today")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Theme.primaryText)
                        .padding(.horizontal, SCREEN_INSET)
                        .padding(.top, 11)

                    statCarousel
                        .padding(.top, 10)

                    reportsHeader
                        .padding(.top, 20)

                    rangePicker
                        .padding(.top, 15)

                    Hairline()
                        .padding(.top, 7.7)

                    ForEach(data.reports) { report in
                        ReportCard(report: report, isRefreshing: store.isRefreshing)

                        Hairline()
                    }
                }
                // Il sensore dello scorrimento sta nello sfondo del contenuto,
                // non come primo elemento alto zero: quello veniva rimisurato
                // solo al rimbalzo, e l'anello faceva un lampo invece di
                // restare per tutto il trascinamento.
                .background(
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: PullOffset.self,
                            value: geo.frame(in: .named("pull")).minY
                        )
                    }
                )
            }
            // Il trascinamento e' riconosciuto qui, non da `refreshable`.
            // Quello di sistema si rompeva appena gli si metteva intorno un
            // overlay, e comunque disegnava la sua rotella: cosi' invece si
            // decide esattamente quando parte, cosa si vede e per quanto.
            // Lettura ufficiale dello scorrimento. I trucchi con GeometryReader
            // qui non riportavano niente, ed e' il motivo per cui il gesto non
            // e' mai partito. Il telefono e' su iOS 26, quindi questa c'e'.
            .modifier(ScrollPullReader { valore in aggiornaPull(valore) })
            .coordinateSpace(name: "pull")
            .onPreferenceChange(PullOffset.self) { aggiornaPull($0) }
            .simultaneousGesture(
                DragGesture(minimumDistance: 12)
                    .onEnded { _ in
                        if armed { startRefresh() } else { armed = false }
                    }
            )
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: store.isRefreshing)
            .overlay(alignment: .top) {
                // L'anello sta fermo. Misurato su cinque screenshot con il
                // contenuto tirato di 60, 91, 126 e 168pt: il centro resta
                // sempre a 121pt dall'alto, cioe' 26pt sotto l'intestazione.
                if store.isRefreshing || pull > 20 {
                    StripeSpinner()
                        .padding(.top, 17)
                }
            }
        }
        .background(Theme.background)
        .sheet(isPresented: $showComposer) { ContentView() }
        .sheet(isPresented: $showEditor) { DashboardEditor() }
    }

    /// Registra quanto e' tirata la lista e decide se e' ora di ricaricare.
    /// La chiamano sia il lettore di iOS 18 sia quello vecchio: vince chi
    /// riporta qualcosa.
    private func aggiornaPull(_ value: CGFloat) {
        let precedente = pull
        pull = value
        if value > pullThreshold { armed = true }

        // Seconda innescata, indipendente dal gesto: quando il dito molla, la
        // lista torna su di colpo.
        if armed, value < precedente - 10, value < pullThreshold {
            startRefresh()
        }
    }

    /// Fa partire la ricarica una volta sola, da qualunque delle innescate
    /// arrivi.
    private func startRefresh() {
        armed = false
        guard !store.isRefreshing else { return }
        Task { await store.refresh() }
    }

    // MARK: - Intestazione

    private var header: some View {
        ZStack {
            Text(data.merchantName)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Theme.primaryText)

            HStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.iconButton)
                    .frame(width: 28, height: 28)
                    .overlay {
                        Image(systemName: "storefront.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.primaryText.opacity(0.85))
                    }

                Spacer()

                Button {
                    showComposer = true
                } label: {
                    Circle()
                        .fill(Theme.accent)
                        .frame(width: 30, height: 30)
                        .overlay {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                }
                .padding(.trailing, 1)
            }
        }
        .padding(.horizontal, SCREEN_INSET)
        .padding(.top, 7)
        .padding(.bottom, 8)
    }

    // MARK: - Fascia del giorno

    /// Le pagine scorrono una alla volta e la successiva sbircia dal bordo:
    /// e' quel dettaglio a far capire che ce n'e' piu' di una.
    private var statCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(data.pages) { page in
                    HStack(spacing: 0) {
                        ForEach(Array(page.items.enumerated()), id: \.element.id) { index, item in
                            VStack(spacing: 12) {
                                Text(item.label)
                                    .font(.system(size: 14))
                                    .foregroundStyle(Theme.primaryText)
                                Text(item.value)
                                    .font(.system(size: 20))
                                    .foregroundStyle(Theme.primaryText)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                            }

                            if index < page.items.count - 1 { Spacer(minLength: 0) }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 14)
                    .frame(height: 82)
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Theme.cardStroke, lineWidth: 1)
                    }
                    .containerRelativeFrame(.horizontal, count: 1, spacing: 12)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.viewAligned)
        .contentMargins(.horizontal, SCREEN_INSET, for: .scrollContent)
    }

    // MARK: - Reports overview

    private var reportsHeader: some View {
        HStack {
            Text("Reports overview")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.primaryText)

            Spacer()

            Button("Edit") { showEditor = true }
                .font(.system(size: 15))
                .foregroundStyle(Theme.accentLight)
        }
        .padding(.horizontal, SCREEN_INSET)
    }

    /// I sette periodi occupano tutta la riga: il primo appoggiato al margine
    /// sinistro, l'ultimo al destro, e lo spazio avanzato diviso in parti
    /// uguali fra loro. Non scorrono, ci stanno tutti.
    private var rangePicker: some View {
        HStack(spacing: 0) {
            ForEach(Array(Period.allCases.enumerated()), id: \.element) { index, period in
                let isSelected = period == store.period

                Text(period.rawValue)
                    .font(.system(size: 12, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? .white : Theme.secondaryText)
                    .padding(.horizontal, 11.7)
                    .padding(.vertical, 9)
                    .background {
                        if isSelected { Capsule().fill(Theme.accent) }
                    }
                    .contentShape(Capsule())
                    .onTapGesture { store.period = period }

                if index < Period.allCases.count - 1 { Spacer(minLength: 0) }
            }
        }
        .padding(.horizontal, 8)
    }
}

/// Un riquadro di report: titolo, variazione, i due totali con i rispettivi
/// intervalli e il grafico sotto.
private struct ReportCard: View {
    let report: Report
    let isRefreshing: Bool

    /// Quanto occupano insieme totali, date e grafico: mentre ricarica al loro
    /// posto va la rotella, e il riquadro non deve cambiare altezza.
    private let bodyHeight: CGFloat = 171

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(report.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.primaryText)

                Spacer()

                if let delta = report.delta, !isRefreshing {
                    Text(percent(delta))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(delta < 0 ? Theme.negativeText : Theme.positiveText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            delta < 0 ? Theme.negativeFill : Theme.positiveFill,
                            in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                        )
                }
            }

            if isRefreshing {
                StripeSpinner()
                    .frame(maxWidth: .infinity)
                    .frame(height: bodyHeight)
            } else {
                filled
            }
        }
        .padding(.horizontal, SCREEN_INSET)
        .padding(.top, 18.7)
        .padding(.bottom, 19)
    }

    /// Il riquadro pieno: i due totali, le date e il grafico.
    private var filled: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(money(report.previousTotal, symbol: report.symbol))
                    .font(.system(size: 18.5))
                    .foregroundStyle(Theme.secondaryText)

                Spacer()

                Text(money(report.currentTotal, symbol: report.symbol))
                    .font(.system(size: 18.5))
                    .foregroundStyle(Theme.accentLight)
            }
            .padding(.top, 2)

            HStack {
                Text(report.previousRange)
                Spacer()
                Text(report.currentRange)
            }
            .font(.system(size: 12))
            .foregroundStyle(Theme.secondaryText)
            .padding(.top, 3.3)

            ReportChart(previous: report.previousSeries, current: report.currentSeries, symbol: report.symbol)
                .padding(.top, 11)
                .padding(.horizontal, 3)
        }
    }
}


/// Quanto e' stata tirata giu' la lista, letta dall'alto del contenuto.
private struct PullOffset: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}


/// Legge quanto la lista e' stata tirata oltre il bordo alto, con l'API di
/// sistema invece che misurando la geometria del contenuto.
private struct ScrollPullReader: ViewModifier {
    let onChange: (CGFloat) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: CGFloat.self) { geo in
                // A riposo lo scorrimento vale meno il margine alto: tirando
                // giu' diventa piu' negativo, quindi il valore cresce.
                -(geo.contentOffset.y + geo.contentInsets.top)
            } action: { _, nuovo in
                onChange(max(0, nuovo))
            }
        } else {
            content
        }
    }
}
