import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, Line } from 'recharts';

// ============================================
// CONSTANTEN
// ============================================
const BELPEX_HOURLY_PROFILE_2024 = {
  0: 70.08, 1: 63.71, 2: 60.18, 3: 56.25, 4: 54.71, 5: 58.85,
  6: 70.42, 7: 84.05, 8: 88.18, 9: 76.97, 10: 64.38, 11: 55.05,
  12: 48.90, 13: 44.16, 14: 44.13, 15: 50.52, 16: 60.82, 17: 78.16,
  18: 95.39, 19: 106.41, 20: 101.99, 21: 91.38, 22: 86.14, 23: 76.85
};

const BELPEX_MONTHLY_FACTORS = {
  1: 1.12, 2: 0.87, 3: 0.87, 4: 0.68, 5: 0.77, 6: 0.87,
  7: 0.78, 8: 0.93, 9: 0.95, 10: 1.11, 11: 1.55, 12: 1.50
};

const MONTHLY_PV_FACTORS = {
  1: 0.032, 2: 0.052, 3: 0.082, 4: 0.108,
  5: 0.128, 6: 0.138, 7: 0.132, 8: 0.118,
  9: 0.088, 10: 0.062, 11: 0.038, 12: 0.022
};

const SUN_TIMES = {
  1: [8.5, 17.0], 2: [7.8, 18.0], 3: [7.0, 19.0], 4: [6.5, 20.5],
  5: [5.8, 21.2], 6: [5.3, 22.0], 7: [5.5, 21.8], 8: [6.2, 21.0],
  9: [7.0, 20.0], 10: [7.8, 18.8], 11: [8.0, 17.2], 12: [8.5, 16.5]
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const AFNAME_TOESLAG = 0.14;
const INJECTIE_KOST = 0.0115;

// ============================================
// HULPFUNCTIES
// ============================================
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function calculatePVProduction(hour, month, day, annualProduction) {
  const [sunrise, sunset] = SUN_TIMES[month];
  if (hour < sunrise || hour > sunset) return 0;
  
  const dayLength = sunset - sunrise;
  const dayPosition = (hour - sunrise) / dayLength;
  const dailyFactor = Math.sin(Math.PI * dayPosition);
  
  const monthlyFactor = MONTHLY_PV_FACTORS[month];
  const daysInMonth = DAYS_IN_MONTH[month - 1];
  const monthlyProduction = annualProduction * monthlyFactor;
  const dailyProduction = monthlyProduction / daysInMonth;
  
  const seed = day + month * 100;
  const weatherRand = seededRandom(seed);
  let weatherFactor;
  
  if (month >= 6 && month <= 8) {
    if (weatherRand < 0.65) weatherFactor = 0.9 + seededRandom(seed + 1) * 0.15;
    else if (weatherRand < 0.85) weatherFactor = 0.5 + seededRandom(seed + 2) * 0.3;
    else weatherFactor = 0.1 + seededRandom(seed + 3) * 0.3;
  } else {
    if (weatherRand < 0.4) weatherFactor = 0.85 + seededRandom(seed + 1) * 0.15;
    else if (weatherRand < 0.75) weatherFactor = 0.4 + seededRandom(seed + 2) * 0.35;
    else weatherFactor = 0.1 + seededRandom(seed + 3) * 0.25;
  }
  
  const basePerHour = dailyProduction / (dayLength * 2 / Math.PI);
  return Math.max(0, dailyFactor * basePerHour * weatherFactor);
}

function getBelpexPrice(hour, month) {
  const basePrice = BELPEX_HOURLY_PROFILE_2024[hour] || 70;
  const monthlyFactor = BELPEX_MONTHLY_FACTORS[month] || 1;
  return basePrice * monthlyFactor / 1000;
}

function parseFluviusCSV(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const data = [];
  
  const header = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"﻿]/g, ''));
  
  const dateIdx = header.findIndex(h => h.includes('van') && h.includes('datum'));
  const timeIdx = header.findIndex(h => h.includes('van') && h.includes('tijdstip'));
  const registerIdx = header.findIndex(h => h === 'register');
  const volumeIdx = header.findIndex(h => h === 'volume');
  const eenheidIdx = header.findIndex(h => h === 'eenheid');
  
  const colDate = dateIdx >= 0 ? dateIdx : 0;
  const colTime = timeIdx >= 0 ? timeIdx : 1;
  const colRegister = registerIdx >= 0 ? registerIdx : 7;
  const colVolume = volumeIdx >= 0 ? volumeIdx : 8;
  const colEenheid = eenheidIdx >= 0 ? eenheidIdx : 9;
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(';');
    if (parts.length < Math.max(colDate, colTime, colRegister, colVolume) + 1) continue;
    
    const register = parts[colRegister] || '';
    const eenheid = parts[colEenheid] || '';
    
    if (register.includes('Injectie')) continue;
    if (eenheid.includes('kVArh') || register.includes('kVArh')) continue;
    if (!register.includes('Afname')) continue;
    
    const dateStr = parts[colDate];
    const timeStr = parts[colTime];
    const volumeStr = parts[colVolume];
    
    if (!dateStr || !timeStr || !volumeStr) continue;
    
    const dateParts = dateStr.split('-');
    if (dateParts.length !== 3) continue;
    
    const day = parseInt(dateParts[0]);
    const month = parseInt(dateParts[1]);
    const year = parseInt(dateParts[2]);
    
    const timeParts = timeStr.split(':');
    const hour = parseInt(timeParts[0]);
    const minute = parseInt(timeParts[1] || 0);
    
    const volume = parseFloat(volumeStr.replace(',', '.'));
    
    if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hour) || isNaN(volume)) continue;
    
    data.push({
      datetime: new Date(year, month - 1, day, hour, minute),
      year, month, day, hour, minute,
      afname: volume
    });
  }
  
  return data;
}

function simulateCurrentSituation(data, fixedPrice) {
  let totalAfname = 0;
  let totalCost = 0;
  
  data.forEach(record => {
    totalAfname += record.afname;
    totalCost += record.afname * fixedPrice;
  });
  
  return { totalAfname, totalCost };
}

function simulatePVOnly(data, annualPVProduction, fixedPrice) {
  let totalAfname = 0, totalInjectie = 0, totalPV = 0;
  let totalEigenverbruik = 0, totalCost = 0, totalOpbrengst = 0;
  
  let modeledPVTotal = 0;
  data.forEach(record => {
    modeledPVTotal += calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction) / 4;
  });
  
  const uniqueDays = new Set(data.map(r => `${r.year}-${r.month}-${r.day}`)).size;
  const expectedPV = annualPVProduction * (uniqueDays / 365);
  const scaleFactor = modeledPVTotal > 0 ? expectedPV / modeledPVTotal : 1;
  
  data.forEach(record => {
    const pv = (calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction) / 4) * scaleFactor;
    const verbruik = record.afname;
    
    const eigenverbruik = Math.min(pv, verbruik);
    const overschot = Math.max(0, pv - verbruik);
    const tekort = Math.max(0, verbruik - pv);
    
    const prijsInjectie = getBelpexPrice(record.hour, record.month) - INJECTIE_KOST;
    
    totalPV += pv;
    totalEigenverbruik += eigenverbruik;
    totalInjectie += overschot;
    totalAfname += tekort;
    totalCost += tekort * fixedPrice;
    totalOpbrengst += overschot * Math.max(0, prijsInjectie);
  });
  
  return {
    totalAfname, totalInjectie, totalPV, totalEigenverbruik,
    totalCost, totalOpbrengst,
    nettoCost: totalCost - totalOpbrengst,
    zelfconsumptie: totalPV > 0 ? (totalEigenverbruik / totalPV) * 100 : 0
  };
}

function simulateSmartBattery(data, annualPVProduction, batteryCapacity, batteryPower) {
  let totalAfname = 0, totalInjectie = 0, totalPV = 0;
  let totalEigenverbruik = 0, totalCost = 0, totalOpbrengst = 0;
  let totalCurtailed = 0;
  
  let soc = batteryCapacity * 0.5;
  const maxChargePerInterval = batteryPower / 4;
  const maxDischargePerInterval = batteryPower / 4;
  
  let modeledPVTotal = 0;
  data.forEach(record => {
    modeledPVTotal += calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction) / 4;
  });
  
  const uniqueDays = new Set(data.map(r => `${r.year}-${r.month}-${r.day}`)).size;
  const expectedPV = annualPVProduction * (uniqueDays / 365);
  const scaleFactor = modeledPVTotal > 0 ? expectedPV / modeledPVTotal : 1;
  
  const futureDeficits = new Array(data.length).fill(0);
  let runningDeficit = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const record = data[i];
    const pv = (calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction) / 4) * scaleFactor;
    runningDeficit += Math.max(0, record.afname - pv);
    futureDeficits[i] = Math.min(runningDeficit, batteryCapacity * 2);
  }
  
  data.forEach((record, idx) => {
    const pv = (calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction) / 4) * scaleFactor;
    const verbruik = record.afname;
    
    const prijsMarkt = getBelpexPrice(record.hour, record.month);
    const prijsAfname = prijsMarkt + AFNAME_TOESLAG;
    const prijsInjectie = prijsMarkt - INJECTIE_KOST;
    
    const maxCharge = Math.min(maxChargePerInterval, batteryCapacity - soc);
    const maxDischarge = Math.min(maxDischargePerInterval, soc);
    
    let charge = 0, discharge = 0, curtailed = 0;
    let injectPV = 0, injectArb = 0, netAfname = 0;
    
    const pvForHouse = Math.min(pv, verbruik);
    let pvRemaining = pv - pvForHouse;
    let houseRemaining = verbruik - pvForHouse;
    
    charge = Math.min(pvRemaining, maxCharge);
    const pvAfterBattery = pvRemaining - charge;
    
    if (prijsInjectie >= 0) {
      injectPV = pvAfterBattery;
    } else {
      curtailed = pvAfterBattery;
    }
    
    if (houseRemaining > 0) {
      const dischargeForHouse = Math.min(houseRemaining, maxDischarge);
      discharge += dischargeForHouse;
      netAfname = houseRemaining - dischargeForHouse;
    }
    
    const futureDeficit = futureDeficits[idx] || 0;
    if (prijsInjectie > 0.05) {
      const neededReserve = Math.min(futureDeficit, batteryCapacity) * 0.5 + 0.5;
      const remainingDischargeCapacity = maxDischarge - discharge;
      const availableSoc = soc + charge - discharge;
      const sellable = Math.max(0, Math.min(availableSoc - neededReserve, remainingDischargeCapacity));
      
      if (sellable > 0 && prijsInjectie > 0.08) {
        const priceFactor = Math.min(1, (prijsInjectie - 0.05) / 0.10);
        injectArb = sellable * priceFactor * 0.5;
        discharge += injectArb;
      }
    }
    
    soc = Math.max(0, Math.min(batteryCapacity, soc + charge - discharge));
    
    totalPV += pv;
    totalEigenverbruik += pvForHouse + Math.min(discharge, houseRemaining);
    totalInjectie += injectPV + injectArb;
    totalAfname += netAfname;
    totalCurtailed += curtailed;
    totalCost += netAfname * prijsAfname;
    totalOpbrengst += (injectPV + injectArb) * Math.max(0, prijsInjectie);
  });
  
  return {
    totalAfname, totalInjectie, totalPV, totalEigenverbruik,
    totalCost, totalOpbrengst, totalCurtailed,
    nettoCost: totalCost - totalOpbrengst,
    zelfconsumptie: totalPV > 0 ? (totalEigenverbruik / totalPV) * 100 : 0
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('nl-BE', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('nl-BE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function PVBatterijCalculator() {
  const [csvData, setCsvData] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('all');
  const [annualPV, setAnnualPV] = useState(6000);
  const [batteryCapacity, setBatteryCapacity] = useState(9);
  const [batteryPower, setBatteryPower] = useState(5);
  const [fixedPrice, setFixedPrice] = useState(0.30);
  const [installationCost, setInstallationCost] = useState(12000);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('results');

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseFluviusCSV(text);
        
        if (parsed.length === 0) {
          throw new Error('Geen geldige data gevonden in CSV bestand');
        }
        
        // Extract available years
        const years = [...new Set(parsed.map(r => r.year))].sort();
        setAvailableYears(years);
        setSelectedYear('all');
        
        setRawData(parsed);
        setCsvData({
          filename: file.name,
          records: parsed.length,
          startDate: parsed[0]?.datetime,
          endDate: parsed[parsed.length - 1]?.datetime
        });
      } catch (err) {
        setError(err.message);
      }
    };
    reader.onerror = () => {
      setError('Fout bij het lezen van het bestand');
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  // Filter data based on selected year
  const filteredData = useMemo(() => {
    if (selectedYear === 'all') return rawData;
    return rawData.filter(r => r.year === parseInt(selectedYear));
  }, [rawData, selectedYear]);

  // Year statistics for display
  const yearStats = useMemo(() => {
    if (rawData.length === 0) return {};
    
    const stats = {};
    rawData.forEach(record => {
      if (!stats[record.year]) {
        stats[record.year] = { afname: 0, records: 0, days: new Set() };
      }
      stats[record.year].afname += record.afname;
      stats[record.year].records += 1;
      stats[record.year].days.add(`${record.month}-${record.day}`);
    });
    
    Object.keys(stats).forEach(year => {
      stats[year].days = stats[year].days.size;
    });
    
    return stats;
  }, [rawData]);

  const results = useMemo(() => {
    if (filteredData.length === 0) return null;
    
    const current = simulateCurrentSituation(filteredData, fixedPrice);
    const pvOnly = simulatePVOnly(filteredData, annualPV, fixedPrice);
    const withPVBattery = simulateSmartBattery(filteredData, annualPV, batteryCapacity, batteryPower);
    
    const uniqueDays = new Set(filteredData.map(r => `${r.year}-${r.month}-${r.day}`)).size;
    const annualFactor = 365 / uniqueDays;
    
    return {
      current,
      pvOnly,
      withPVBattery,
      annualFactor,
      uniqueDays,
      savings: current.totalCost - withPVBattery.nettoCost,
      savingsPVOnly: current.totalCost - pvOnly.nettoCost,
      annualSavings: (current.totalCost - withPVBattery.nettoCost) * annualFactor,
      annualSavingsPVOnly: (current.totalCost - pvOnly.nettoCost) * annualFactor,
      paybackYears: installationCost / ((current.totalCost - withPVBattery.nettoCost) * annualFactor),
      paybackYearsPVOnly: installationCost / ((current.totalCost - pvOnly.nettoCost) * annualFactor)
    };
  }, [filteredData, annualPV, batteryCapacity, batteryPower, fixedPrice, installationCost]);

  const monthlyData = useMemo(() => {
    if (filteredData.length === 0) return [];
    
    const months = {};
    filteredData.forEach(record => {
      const key = `${record.year}-${String(record.month).padStart(2, '0')}`;
      if (!months[key]) {
        months[key] = { month: key, afname: 0, records: 0 };
      }
      months[key].afname += record.afname;
      months[key].records += 1;
    });
    
    return Object.values(months).map(m => ({
      ...m,
      afname: Math.round(m.afname),
      pvEstimate: Math.round(annualPV * (MONTHLY_PV_FACTORS[parseInt(m.month.split('-')[1])] || 0.08))
    }));
  }, [filteredData, annualPV]);

  const dailyProfile = useMemo(() => {
    if (filteredData.length === 0) return [];
    
    const hours = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { hour: h, afname: 0, count: 0 };
    }
    
    filteredData.forEach(record => {
      hours[record.hour].afname += record.afname;
      hours[record.hour].count += 1;
    });
    
    const avgMonth = Math.round(filteredData.reduce((sum, r) => sum + r.month, 0) / filteredData.length);
    
    return Object.values(hours).map(h => ({
      hour: `${h.hour}:00`,
      afname: h.count > 0 ? h.afname / h.count * 4 : 0,
      pv: calculatePVProduction(h.hour + 0.5, avgMonth, 15, annualPV) * (results?.annualFactor || 1) / (365 / 30),
      prijs: BELPEX_HOURLY_PROFILE_2024[h.hour] || 70
    }));
  }, [filteredData, annualPV, results]);

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#e8edf5',
    fontSize: '16px',
    fontWeight: '600',
    outline: 'none'
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0d1f3c 100%)',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#e8edf5',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            boxShadow: '0 4px 20px rgba(251, 191, 36, 0.3)'
          }}>
            ⚡
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              margin: 0,
              background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Zonnepanelen & Batterij Calculator
            </h1>
            <p style={{ margin: 0, color: '#8896ab', fontSize: '14px' }}>
              Bereken uw besparing met PV + thuisbatterij op dynamisch tarief
            </p>
          </div>
        </div>
      </div>

      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '380px 1fr',
        gap: '24px'
      }}>
        {/* Left Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* File Upload */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>📄</span>
              Fluvius Data Uploaden
            </h3>
            
            <label style={{
              display: 'block',
              padding: '32px',
              border: '2px dashed rgba(251, 191, 36, 0.3)',
              borderRadius: '12px',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(251, 191, 36, 0.02)'
            }}>
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📊</div>
              <div style={{ color: '#fbbf24', fontWeight: '500' }}>
                {csvData ? csvData.filename : 'Klik om CSV te selecteren'}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7a8f', marginTop: '4px' }}>
                Fluvius kwartierwaarden export
              </div>
            </label>
            
            {csvData && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(34, 197, 94, 0.2)'
              }}>
                <div style={{ color: '#22c55e', fontWeight: '500', fontSize: '14px' }}>
                  ✓ Data geladen
                </div>
                <div style={{ color: '#8896ab', fontSize: '12px', marginTop: '4px' }}>
                  {formatNumber(csvData.records)} records • {results?.uniqueDays} dagen
                </div>
              </div>
            )}

            {/* Year Selector */}
            {availableYears.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                  📅 Referentiejaar selecteren
                </label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    color: '#fbbf24',
                    borderColor: 'rgba(251, 191, 36, 0.3)'
                  }}
                >
                  <option value="all">Alle jaren ({formatNumber(rawData.length)} records)</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>
                      {year} ({yearStats[year]?.days} dagen, {formatNumber(Math.round(yearStats[year]?.afname || 0))} kWh)
                    </option>
                  ))}
                </select>
                {selectedYear !== 'all' && (
                  <div style={{ fontSize: '11px', color: '#6b7a8f', marginTop: '4px' }}>
                    Berekening gebaseerd op data van {selectedYear}
                  </div>
                )}
              </div>
            )}
            
            {error && (
              <div style={{
                marginTop: '16px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                fontSize: '13px'
              }}>
                ⚠️ {error}
              </div>
            )}
          </div>

          {/* Parameters */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>⚙️</span>
              Configuratie
            </h3>
            
            {/* Fixed Price */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                Huidige stroomprijs (vast tarief)
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0.10"
                  max="0.60"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(parseFloat(e.target.value) || 0.30)}
                  style={{ ...inputStyle, paddingRight: '70px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                />
                <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8896ab', fontSize: '14px' }}>
                  €/kWh
                </span>
              </div>
            </div>

            {/* PV Production */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                Geschatte jaarlijkse PV opbrengst
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="1000"
                  max="20000"
                  step="100"
                  value={annualPV}
                  onChange={(e) => setAnnualPV(parseInt(e.target.value) || 6000)}
                  style={{ ...inputStyle, paddingRight: '80px', color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)' }}
                />
                <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8896ab', fontSize: '14px' }}>
                  kWh/jaar
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7a8f', marginTop: '4px' }}>
                ≈ {Math.round(annualPV / 1000)} kWp systeem
              </div>
            </div>

            {/* Battery Capacity */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                Batterijcapaciteit
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  max="30"
                  step="1"
                  value={batteryCapacity}
                  onChange={(e) => setBatteryCapacity(parseInt(e.target.value) || 0)}
                  style={{ ...inputStyle, paddingRight: '50px', color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                />
                <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8896ab', fontSize: '14px' }}>
                  kWh
                </span>
              </div>
            </div>

            {/* Battery Power */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                Batterijvermogen
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="1"
                  max="15"
                  step="0.5"
                  value={batteryPower}
                  onChange={(e) => setBatteryPower(parseFloat(e.target.value) || 5)}
                  style={{ ...inputStyle, paddingRight: '50px', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.3)' }}
                />
                <span style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8896ab', fontSize: '14px' }}>
                  kW
                </span>
              </div>
            </div>

            {/* Installation Cost */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: '#8896ab', marginBottom: '8px' }}>
                Totale installatiekost (PV + Batterij)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: '#8896ab', fontSize: '14px' }}>
                  €
                </span>
                <input
                  type="number"
                  min="1000"
                  max="50000"
                  step="100"
                  value={installationCost}
                  onChange={(e) => setInstallationCost(parseInt(e.target.value) || 12000)}
                  style={{ ...inputStyle, paddingLeft: '36px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
                />
              </div>
              <div style={{ fontSize: '11px', color: '#6b7a8f', marginTop: '4px' }}>
                Inclusief zonnepanelen, omvormer, batterij en installatie
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.08)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            fontSize: '12px',
            color: '#8896ab'
          }}>
            <div style={{ color: '#3b82f6', fontWeight: '600', marginBottom: '8px' }}>
              ℹ️ Over deze berekening
            </div>
            <ul style={{ margin: 0, paddingLeft: '16px', lineHeight: '1.6' }}>
              <li>Belpex day-ahead marktprijzen 2024</li>
              <li>Dynamisch tarief: marktprijs + €0.14/kWh</li>
              <li>Injectie: marktprijs - €0.0115/kWh</li>
              <li>Slimme batterij met optimalisatie</li>
            </ul>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div>
          {!csvData ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: '16px',
              border: '1px dashed rgba(255,255,255,0.1)'
            }}>
              <div style={{ textAlign: 'center', color: '#6b7a8f' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }}>📊</div>
                <div style={{ fontSize: '16px' }}>Upload uw Fluvius data om te starten</div>
                <div style={{ fontSize: '13px', marginTop: '8px' }}>
                  Download uw verbruiksdata via MijnFluvius
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {/* Current Situation */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.05) 100%)',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '1px solid rgba(239, 68, 68, 0.2)'
                }}>
                  <div style={{ fontSize: '13px', color: '#ef4444', marginBottom: '4px', fontWeight: '500' }}>
                    📍 HUIDIGE SITUATIE
                  </div>
                  <div style={{ fontSize: '11px', color: '#8896ab', marginBottom: '12px' }}>
                    Zonder zonnepanelen, vast tarief
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>
                    {formatCurrency(results?.current.totalCost || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8896ab', marginTop: '4px' }}>
                    {formatNumber(results?.current.totalAfname || 0)} kWh verbruik
                  </div>
                </div>

                {/* PV Only */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(251, 191, 36, 0.05) 100%)',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '1px solid rgba(251, 191, 36, 0.2)'
                }}>
                  <div style={{ fontSize: '13px', color: '#fbbf24', marginBottom: '4px', fontWeight: '500' }}>
                    ☀️ ALLEEN ZONNEPANELEN
                  </div>
                  <div style={{ fontSize: '11px', color: '#8896ab', marginBottom: '12px' }}>
                    PV + vast tarief (geen batterij)
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#fbbf24' }}>
                    {formatCurrency(results?.pvOnly.nettoCost || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>
                    Besparing: {formatCurrency(results?.savingsPVOnly || 0)}
                  </div>
                </div>

                {/* PV + Battery */}
                <div style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '1px solid rgba(34, 197, 94, 0.2)'
                }}>
                  <div style={{ fontSize: '13px', color: '#22c55e', marginBottom: '4px', fontWeight: '500' }}>
                    🔋 PV + BATTERIJ + DYNAMISCH
                  </div>
                  <div style={{ fontSize: '11px', color: '#8896ab', marginBottom: '12px' }}>
                    Slimme batterij op Belpex tarief
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
                    {formatCurrency(results?.withPVBattery.nettoCost || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#22c55e', marginTop: '4px' }}>
                    Besparing: {formatCurrency(results?.savings || 0)}
                  </div>
                </div>
              </div>

              {/* Annual Projection */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr',
                gap: '24px'
              }}>
                <div>
                  <div style={{ fontSize: '13px', color: '#a78bfa', marginBottom: '8px' }}>
                    📅 Jaarlijkse projectie
                  </div>
                  <div style={{ fontSize: '11px', color: '#8896ab' }}>
                    Gebaseerd op {results?.uniqueDays} dagen
                    {selectedYear !== 'all' && ` (${selectedYear})`}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#a78bfa' }}>
                    {formatCurrency(results?.annualSavings || 0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8896ab' }}>
                    jaarlijkse besparing
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: '700', color: '#10b981' }}>
                    {results?.paybackYears < 100 ? `${results?.paybackYears.toFixed(1)} jaar` : '∞'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8896ab' }}>
                    terugverdientijd
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '24px', fontWeight: '600', color: '#22c55e' }}>
                    {results?.withPVBattery.zelfconsumptie.toFixed(0)}%
                  </div>
                  <div style={{ fontSize: '12px', color: '#8896ab' }}>
                    zelfconsumptiegraad
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div style={{
                display: 'flex',
                gap: '8px',
                background: 'rgba(255,255,255,0.03)',
                padding: '6px',
                borderRadius: '12px',
                width: 'fit-content'
              }}>
                {[
                  { id: 'results', label: '📊 Resultaten' },
                  { id: 'profile', label: '📈 Dagprofiel' },
                  { id: 'monthly', label: '📅 Maandoverzicht' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: activeTab === tab.id 
                        ? 'linear-gradient(135deg, #fbbf24, #f59e0b)' 
                        : 'transparent',
                      color: activeTab === tab.id ? '#0a1628' : '#8896ab',
                      fontWeight: activeTab === tab.id ? '600' : '400',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid rgba(255,255,255,0.06)'
              }}>
                {activeTab === 'results' && (
                  <div>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600' }}>
                      Gedetailleerde vergelijking
                    </h3>
                    
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '200px repeat(3, 1fr)',
                      gap: '1px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      overflow: 'hidden'
                    }}>
                      {/* Header */}
                      <div style={{ background: '#1a2744', padding: '12px 16px', fontWeight: '600', fontSize: '13px' }}></div>
                      <div style={{ background: '#1a2744', padding: '12px 16px', fontWeight: '600', fontSize: '13px', color: '#ef4444' }}>Huidig</div>
                      <div style={{ background: '#1a2744', padding: '12px 16px', fontWeight: '600', fontSize: '13px', color: '#fbbf24' }}>Alleen PV</div>
                      <div style={{ background: '#1a2744', padding: '12px 16px', fontWeight: '600', fontSize: '13px', color: '#22c55e' }}>PV + Batterij</div>
                      
                      {/* Rows */}
                      {[
                        { label: 'Afname net', current: results?.current.totalAfname, pvOnly: results?.pvOnly.totalAfname, smart: results?.withPVBattery.totalAfname, unit: 'kWh' },
                        { label: 'PV productie', current: 0, pvOnly: results?.pvOnly.totalPV, smart: results?.withPVBattery.totalPV, unit: 'kWh' },
                        { label: 'Eigenverbruik', current: 0, pvOnly: results?.pvOnly.totalEigenverbruik, smart: results?.withPVBattery.totalEigenverbruik, unit: 'kWh' },
                        { label: 'Injectie', current: 0, pvOnly: results?.pvOnly.totalInjectie, smart: results?.withPVBattery.totalInjectie, unit: 'kWh' },
                        { label: 'Kosten afname', current: results?.current.totalCost, pvOnly: results?.pvOnly.totalCost, smart: results?.withPVBattery.totalCost, unit: '€', isCurrency: true },
                        { label: 'Opbrengst injectie', current: 0, pvOnly: results?.pvOnly.totalOpbrengst, smart: results?.withPVBattery.totalOpbrengst, unit: '€', isCurrency: true },
                        { label: 'Netto kosten', current: results?.current.totalCost, pvOnly: results?.pvOnly.nettoCost, smart: results?.withPVBattery.nettoCost, unit: '€', isCurrency: true, highlight: true },
                        { label: 'Jaarlijkse besparing', current: 0, pvOnly: results?.annualSavingsPVOnly, smart: results?.annualSavings, unit: '€', isCurrency: true, highlight: true },
                        { label: 'Terugverdientijd', current: '-', pvOnly: results?.paybackYearsPVOnly < 100 ? `${results?.paybackYearsPVOnly.toFixed(1)} jaar` : '∞', smart: results?.paybackYears < 100 ? `${results?.paybackYears.toFixed(1)} jaar` : '∞', isText: true, highlight: true },
                      ].map((row, idx) => (
                        <React.Fragment key={idx}>
                          <div style={{ background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', padding: '12px 16px', fontSize: '13px', fontWeight: row.highlight ? '600' : '400' }}>
                            {row.label}
                          </div>
                          <div style={{ background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', padding: '12px 16px', fontSize: '13px', textAlign: 'right', fontWeight: row.highlight ? '600' : '400' }}>
                            {row.isText ? row.current : (row.isCurrency ? formatCurrency(row.current || 0) : `${formatNumber(row.current || 0)} ${row.unit}`)}
                          </div>
                          <div style={{ background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', padding: '12px 16px', fontSize: '13px', textAlign: 'right', fontWeight: row.highlight ? '600' : '400' }}>
                            {row.isText ? row.pvOnly : (row.isCurrency ? formatCurrency(row.pvOnly || 0) : `${formatNumber(row.pvOnly || 0)} ${row.unit}`)}
                          </div>
                          <div style={{ background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', padding: '12px 16px', fontSize: '13px', textAlign: 'right', fontWeight: row.highlight ? '600' : '400', color: row.highlight ? '#22c55e' : 'inherit' }}>
                            {row.isText ? row.smart : (row.isCurrency ? formatCurrency(row.smart || 0) : `${formatNumber(row.smart || 0)} ${row.unit}`)}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'profile' && (
                  <div>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600' }}>
                      Gemiddeld dagprofiel
                    </h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <ComposedChart data={dailyProfile}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="hour" stroke="#6b7a8f" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="left" stroke="#6b7a8f" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#6b7a8f" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Area yAxisId="left" type="monotone" dataKey="pv" name="PV Productie" fill="rgba(251, 191, 36, 0.3)" stroke="#fbbf24" strokeWidth={2} />
                        <Bar yAxisId="left" dataKey="afname" name="Verbruik" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="prijs" name="Marktprijs (€/MWh)" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {activeTab === 'monthly' && (
                  <div>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '600' }}>
                      Maandelijks overzicht
                    </h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                        <XAxis dataKey="month" stroke="#6b7a8f" tick={{ fontSize: 11 }} />
                        <YAxis stroke="#6b7a8f" tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#1a2744', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="afname" name="Verbruik (gemeten)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="pvEstimate" name="PV Productie (geschat)" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ maxWidth: '1400px', margin: '32px auto 0', textAlign: 'center', fontSize: '12px', color: '#6b7a8f' }}>
        <p>Berekening gebaseerd op Belpex marktprijzen 2024 • Resultaten zijn schattingen</p>
      </div>
    </div>
  );
}
