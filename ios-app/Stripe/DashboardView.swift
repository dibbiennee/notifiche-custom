import SwiftUI

/// La home: intestazione fissa, fascia "Today" scorrevole in orizzontale e i
/// riquadri di "Reports overview" uno sotto l'altro.
struct DashboardView: View {
    @EnvironmentObject private var store: DashboardStore
    @State private var showComposer = false
    @State private var showEditor = false

    private var data: DashboardData { store.data }

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(data.todayTitle)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(Theme.primaryText)
                        .padding(.horizontal, SCREEN_INSET)
                        .padding(.top, 14)

                    statCarousel
                        .padding(.top, 13)

                    reportsHeader
                        .padding(.top, 24)

                    rangePicker
                        .padding(.top, 16)

                    Rectangle()
                        .fill(Theme.separator)
                        .frame(height: 1)
                        .padding(.top, 10)

                    ForEach(data.reports) { report in
                        ReportCard(report: report)

                        Rectangle()
                            .fill(Theme.separator)
                            .frame(height: 1)
                    }
                }
            }
        }
        .background(Theme.background)
        .sheet(isPresented: $showComposer) { ContentView() }
        .sheet(isPresented: $showEditor) { DashboardEditor() }
    }

    // MARK: - Intestazione

    private var header: some View {
        ZStack {
            Text(data.merchantName)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Theme.primaryText)

            HStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Theme.iconButton)
                    .frame(width: 30, height: 28)
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
                        .frame(width: 32, height: 32)
                        .overlay {
                            Image(systemName: "plus")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                }
            }
        }
        .padding(.horizontal, SCREEN_INSET)
        .padding(.vertical, 8)
    }

    // MARK: - Fascia del giorno

    /// Le pagine scorrono una alla volta e la successiva sbircia dal bordo:
    /// e' quel dettaglio a far capire che ce n'e' piu' di una.
    private var statCarousel: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(data.pages) { page in
                    HStack(spacing: 0) {
                        ForEach(page.items) { item in
                            VStack(spacing: 7) {
                                Text(item.label)
                                    .font(.system(size: 16))
                                    .foregroundStyle(Theme.secondaryText)
                                Text(item.value)
                                    .font(.system(size: 25, weight: .medium))
                                    .foregroundStyle(Theme.primaryText)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.6)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.vertical, 11)
                    .frame(height: 80)
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Theme.cardStroke, lineWidth: 1)
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
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(Theme.primaryText)

            Spacer()

            Button("Edit") { showEditor = true }
                .font(.system(size: 19))
                .foregroundStyle(Theme.accentLight)
        }
        .padding(.horizontal, SCREEN_INSET)
    }

    private var rangePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            // Padding stretto di proposito: i sette periodi devono starci
            // tutti nella larghezza dello schermo, senza doverli scorrere.
            HStack(spacing: 3) {
                ForEach(data.ranges, id: \.self) { range in
                    let isSelected = range == data.selectedRange

                    Text(range)
                        .font(.system(size: 17, weight: isSelected ? .semibold : .regular))
                        .foregroundStyle(isSelected ? .white : Theme.secondaryText)
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background {
                            if isSelected { Capsule().fill(Theme.accent) }
                        }
                        .contentShape(Capsule())
                        .onTapGesture { store.data.selectedRange = range }
                }
            }
        }
        .contentMargins(.horizontal, SCREEN_INSET, for: .scrollContent)
    }
}

/// Un riquadro di report: titolo, variazione, i due totali con i rispettivi
/// intervalli e il grafico sotto.
private struct ReportCard: View {
    let report: Report

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(report.title)
                    .font(.system(size: 23, weight: .bold))
                    .foregroundStyle(Theme.primaryText)

                Spacer()

                if let delta = report.delta {
                    Text(percent(delta))
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(delta < 0 ? Theme.negativeText : Theme.positiveText)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            delta < 0 ? Theme.negativeFill : Theme.positiveFill,
                            in: RoundedRectangle(cornerRadius: 6, style: .continuous)
                        )
                }
            }

            HStack(alignment: .firstTextBaseline) {
                Text(money(report.previousTotal))
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(Theme.secondaryText)

                Spacer()

                Text(money(report.currentTotal))
                    .font(.system(size: 26, weight: .medium))
                    .foregroundStyle(Theme.accentLight)
            }
            .padding(.top, 9)

            HStack {
                Text(report.previousRange)
                Spacer()
                Text(report.currentRange)
            }
            .font(.system(size: 16))
            .foregroundStyle(Theme.secondaryText)
            .padding(.top, 6)

            ReportChart(previous: report.previousSeries, current: report.currentSeries)
                .padding(.top, 12)
        }
        .padding(.horizontal, SCREEN_INSET)
        .padding(.top, 19)
        .padding(.bottom, 19)
    }
}
