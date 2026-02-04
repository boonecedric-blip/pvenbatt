# ⚡ PV & Batterij Calculator

Een moderne React calculator om de besparing te berekenen bij de installatie van zonnepanelen en een thuisbatterij met dynamisch tarief (Belpex) in België.

![Calculator Preview](./docs/preview.png)

## ✨ Features

- **📊 Fluvius Data Import** - Upload je kwartierwaarden CSV export van MijnFluvius
- **☀️ PV Simulatie** - Realistisch Belgisch zonnestralingmodel met weervariatie
- **🔋 Slimme Batterij** - Vooruitkijkende optimalisatie met arbitrage
- **💰 Drie Scenario's**:
  - Huidige situatie (zonder PV, vast tarief)
  - Alleen zonnepanelen (PV + vast tarief)
  - PV + Batterij + Dynamisch tarief (Belpex)
- **📈 Visualisaties** - Dagprofiel, maandoverzicht en gedetailleerde vergelijking
- **🧮 Terugverdientijd** - Automatische berekening op basis van installatiekost

## 🚀 Quick Start

### Lokaal draaien

```bash
# Clone de repository
git clone https://github.com/yourusername/pv-batterij-calculator.git
cd pv-batterij-calculator

# Installeer dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in je browser.

### Productie build

```bash
npm run build
npm run preview
```

## 🌐 Deploy naar Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/pv-batterij-calculator)

Of handmatig:

1. Push je code naar GitHub
2. Ga naar [vercel.com](https://vercel.com)
3. Import je repository
4. Vercel detecteert automatisch de Vite configuratie
5. Klik op "Deploy"

## 📁 Project Structuur

```
pv-batterij-calculator/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   └── PVBatterijCalculator.jsx
│   ├── data/
│   │   └── constants.js
│   ├── utils/
│   │   └── calculations.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── package.json
├── vite.config.js
└── vercel.json
```

## ⚙️ Configuratie Parameters

| Parameter | Standaard | Beschrijving |
|-----------|-----------|--------------|
| Stroomprijs | €0.30/kWh | Huidige vaste stroomprijs |
| PV Opbrengst | 6000 kWh/jaar | Geschatte jaarlijkse productie |
| Batterijcapaciteit | 9 kWh | Bruikbare capaciteit |
| Batterijvermogen | 5 kW | Max laad/ontlaad vermogen |
| Installatiekost | €12.000 | Totale investering |

## 📊 Berekeningsmodel

### Prijzen
- **Dynamisch tarief**: Belpex marktprijs + €0.14/kWh toeslag
- **Injectie**: Belpex marktprijs - €0.0115/kWh kost
- **Data**: Belpex day-ahead prijzen 2024 (gemiddeld uurprofiel)

### PV Model
- Belgisch zonnestralingprofiel (lat ~51°)
- Maandelijkse productieverdeling
- Realistische weervariatie

### Batterij Strategie
1. PV overschot eerst naar eigen verbruik
2. Rest naar batterij opslaan
3. Curtailment bij negatieve injectieprijzen
4. Arbitrage bij hoge marktprijzen (met reserve voor nachtverbruik)

## 🛠️ Tech Stack

- [React 18](https://react.dev/) - UI Framework
- [Vite](https://vitejs.dev/) - Build Tool
- [Recharts](https://recharts.org/) - Grafieken
- [Vercel](https://vercel.com/) - Hosting

## 📝 Fluvius Data Formaat

De calculator verwacht een CSV export van MijnFluvius met kwartierwaarden:

```csv
Van (datum);Van (tijdstip);Tot (datum);Tot (tijdstip);EAN-code;Meter;Metertype;Register;Volume;Eenheid;Validatiestatus
21-11-2024;00:00:00;21-11-2024;00:15:00;="541448820040564119";1SAG...;Digitale meter;Afname Nacht;0,012;kWh;Geschat
```

## 📄 Licentie

MIT License - zie [LICENSE](LICENSE) voor details.

## 🤝 Bijdragen

Bijdragen zijn welkom! Open een issue of pull request.

---

Gemaakt met ❤️ voor de Belgische energietransitie
