import React, { useState, useMemo, useCallback } from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area 
} from 'recharts';

import {
  parseFluviusCSV,
  simulateCurrentSituation,
  simulatePVOnly,
  simulateSmartBattery,
  calculatePVProduction,
  formatCurrency,
  formatNumber
} from '../utils/calculations';

import {
  MONTHLY_PV_FACTORS,
  BELPEX_HOURLY_PROFILE_2024,
  DEFAULT_CONFIG
} from '../data/constants';

export default function PVBatterijCalculator() {
  const [csvData, setCsvData] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [annualPV, setAnnualPV] = useState(DEFAULT_CONFIG.annualPV);
  const [batteryCapacity, setBatteryCapacity] = useState(DEFAULT_CONFIG.batteryCapacity);
  const [batteryPower, setBatteryPower] = useState(DEFAULT_CONFIG.batteryPower);
  const [fixedPrice, setFixedPrice] = useState(DEFAULT_CONFIG.fixedPrice);
  const [installationCost, setInstallationCost] = useState(DEFAULT_CONFIG.installationCost);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('results');

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const parsed = parseFluviusCSV(text);
        
        if (parsed.length === 0) {
          throw new Error('Geen geldige data gevonden in CSV bestand');
        }
        
        setRawData(parsed);
        setCsvData({
          filename: file.name,
          records: parsed.length,
          startDate: parsed[0]?.datetime,
          endDate: parsed[parsed.length - 1]?.datetime
        });
        setIsLoading(false);
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Fout bij het lezen van het bestand');
      setIsLoading(false);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const results = useMemo(() => {
    if (rawData.length === 0) return null;
    
    const current = simulateCurrentSituation(rawData, fixedPrice);
    const withPVBattery = simulateSmartBattery(rawData, annualPV, batteryCapacity, batteryPower);
    const pvOnly = simulatePVOnly(rawData, annualPV);
    
    const uniqueDays = new Set(rawData.map(r => `${r.year}-${r.month}-${r.day}`)).size;
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
  }, [rawData, annualPV, batteryCapacity, batteryPower, fixedPrice, installationCost]);

  // Monthly breakdown
  const monthlyData = useMemo(() => {
    if (rawData.length === 0) return [];
    
    const months = {};
    rawData.forEach(record => {
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
  }, [rawData, annualPV]);

  // Daily profile (average)
  const dailyProfile = useMemo(() => {
    if (rawData.length === 0) return [];
    
    const hours = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = { hour: h, afname: 0, count: 0 };
    }
    
    rawData.forEach(record => {
      hours[record.hour].afname += record.afname;
      hours[record.hour].count += 1;
    });
    
    // Get average month for PV calculation
    const avgMonth = Math.round(rawData.reduce((sum, r) => sum + r.month, 0) / rawData.length);
    
    return Object.values(hours).map(h => ({
      hour: `${h.hour}:00`,
      afname: h.count > 0 ? h.afname / h.count * 4 : 0, // Per hour
      pv: calculatePVProduction(h.hour + 0.5, avgMonth, 15, annualPV) * (results?.annualFactor || 1) / (365 / 30),
      prijs: BELPEX_HOURLY_PROFILE_2024[h.hour] || 70
    }));
  }, [rawData, annualPV, results]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0d1f3c 100%)',
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#e8edf5',
      padding: '24px'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        marginBottom: '32px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '8px'
        }}>
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
            <p style={{
              margin: 0,
              color: '#8896ab',
              fontSize: '14px'
            }}>
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
      }} className="main-grid">
        {/* Left Panel - Configuration */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          {/* File Upload */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.06)'
          }}>
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              margin: '0 0 16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
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
              transition: 'all 0.2s',
              background: 'rgba(251, 191, 36, 0.02)'
            }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
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
            <h3 style={{
              fontSize: '16px',
              fontWeight: '600',
              margin: '0 0 20px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '20px' }}>⚙️</span>
              Configuratie
            </h3>
            
            {/* Current Fixed Price */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                color: '#8896ab',
                marginBottom: '8px'
              }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 70px 12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '16px',
                    fontWeight: '600',
                    outline: 'none'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#8896ab',
                  fontSize: '14px'
                }}>
                  €/kWh
                </span>
              </div>
            </div>

            {/* PV Production */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                color: '#8896ab',
                marginBottom: '8px'
              }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 80px 12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '8px',
                    color: '#fbbf24',
                    fontSize: '16px',
                    fontWeight: '600',
                    outline: 'none'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#8896ab',
                  fontSize: '14px'
                }}>
                  kWh/jaar
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#6b7a8f', marginTop: '4px' }}>
                ≈ {Math.round(annualPV / 1000)} kWp systeem
              </div>
            </div>

            {/* Battery Capacity */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                color: '#8896ab',
                marginBottom: '8px'
              }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 50px 12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#3b82f6',
                    fontSize: '16px',
                    fontWeight: '600',
                    outline: 'none'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#8896ab',
                  fontSize: '14px'
                }}>
                  kWh
                </span>
              </div>
            </div>

            {/* Battery Power */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                color: '#8896ab',
                marginBottom: '8px'
              }}>
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
                  style={{
                    width: '100%',
                    padding: '12px 50px 12px 16px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: '8px',
                    color: '#8b5cf6',
                    fontSize: '16px',
                    fontWeight: '600',
                    outline: 'none'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#8896ab',
                  fontSize: '14px'
                }}>
                  kW
                </span>
              </div>
            </div>

            {/* Installation Cost */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                color: '#8896ab',
                marginBottom: '8px'
              }}>
                Totale installatiekost (PV + Batterij)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#8896ab',
                  fontSize: '14px'
                }}>
                  €
                </span>
                <input
                  type="number"
                  min="1000"
                  max="50000"
                  step="100"
                  value={installationCost}
                  onChange={(e) => setInstallationCost(parseInt(e.target.value) || 12000)}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 36px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    color: '#10b981',
                    fontSize: '16px',
                    fontWeight: '600',
                    outline: 'none'
                  }}
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
              <li>Gebruikt Belpex day-ahead marktprijzen 2024</li>
              <li>Dynamisch tarief: marktprijs + €0.14/kWh toeslag</li>
              <li>Injectie: marktprijs - €0.0115/kWh kost</li>
              <li>Slimme batterij met vooruitkijkende optimalisatie</li>
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
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '16px'
              }} className="summary-cards">
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
              }} className="annual-projection">
                <div>
                  <div style={{ fontSize: '13px', color: '#a78bfa', marginBottom: '8px' }}>
                    📅 Jaarlijkse projectie
                  </div>
                  <div style={{ fontSize: '11px', color: '#8896ab' }}>
                    Gebaseerd op {results?.uniqueDays} dagen data
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
                      fontSize: '13px',
                      transition: 'all 0.2s'
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
                    }} className="results-table">
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
                        { label: 'Curtailed', current: 0, pvOnly: 0, smart: results?.withPVBattery.totalCurtailed, unit: 'kWh' },
                        { label: 'Kosten afname', current: results?.current.totalCost, pvOnly: results?.pvOnly.totalCost, smart: results?.withPVBattery.totalCost, unit: '€', isCurrency: true },
                        { label: 'Opbrengst injectie', current: 0, pvOnly: results?.pvOnly.totalOpbrengst, smart: results?.withPVBattery.totalOpbrengst, unit: '€', isCurrency: true },
                        { label: 'Netto kosten', current: results?.current.totalCost, pvOnly: results?.pvOnly.nettoCost, smart: results?.withPVBattery.nettoCost, unit: '€', isCurrency: true, highlight: true },
                        { label: 'Jaarlijkse besparing', current: 0, pvOnly: results?.annualSavingsPVOnly, smart: results?.annualSavings, unit: '€', isCurrency: true, highlight: true },
                        { label: 'Terugverdientijd', current: '-', pvOnly: results?.paybackYearsPVOnly < 100 ? `${results?.paybackYearsPVOnly.toFixed(1)} jaar` : '∞', smart: results?.paybackYears < 100 ? `${results?.paybackYears.toFixed(1)} jaar` : '∞', unit: '', isText: true, highlight: true },
                      ].map((row, idx) => (
                        <React.Fragment key={idx}>
                          <div style={{ 
                            background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', 
                            padding: '12px 16px', 
                            fontSize: '13px',
                            fontWeight: row.highlight ? '600' : '400'
                          }}>
                            {row.label}
                          </div>
                          <div style={{ 
                            background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', 
                            padding: '12px 16px', 
                            fontSize: '13px',
                            textAlign: 'right',
                            fontWeight: row.highlight ? '600' : '400'
                          }}>
                            {row.isText ? row.current : (row.isCurrency ? formatCurrency(row.current || 0) : `${formatNumber(row.current || 0)} ${row.unit}`)}
                          </div>
                          <div style={{ 
                            background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', 
                            padding: '12px 16px', 
                            fontSize: '13px',
                            textAlign: 'right',
                            fontWeight: row.highlight ? '600' : '400'
                          }}>
                            {row.isText ? row.pvOnly : (row.isCurrency ? formatCurrency(row.pvOnly || 0) : `${formatNumber(row.pvOnly || 0)} ${row.unit}`)}
                          </div>
                          <div style={{ 
                            background: row.highlight ? 'rgba(34, 197, 94, 0.1)' : '#0d1f3c', 
                            padding: '12px 16px', 
                            fontSize: '13px',
                            textAlign: 'right',
                            fontWeight: row.highlight ? '600' : '400',
                            color: row.highlight ? '#22c55e' : 'inherit'
                          }}>
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
                        <XAxis 
                          dataKey="hour" 
                          stroke="#6b7a8f"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          yAxisId="left"
                          stroke="#6b7a8f"
                          tick={{ fontSize: 11 }}
                          label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: '#6b7a8f', fontSize: 11 }}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          stroke="#6b7a8f"
                          tick={{ fontSize: 11 }}
                          label={{ value: '€/MWh', angle: 90, position: 'insideRight', fill: '#6b7a8f', fontSize: 11 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#1a2744', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="pv"
                          name="PV Productie"
                          fill="rgba(251, 191, 36, 0.3)"
                          stroke="#fbbf24"
                          strokeWidth={2}
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="afname"
                          name="Verbruik"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="prijs"
                          name="Marktprijs"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <div style={{ 
                      marginTop: '16px', 
                      padding: '12px 16px', 
                      background: 'rgba(251, 191, 36, 0.1)',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fbbf24'
                    }}>
                      💡 Tip: De batterij slaat PV-overschot op tijdens de dag (lage prijzen) en gebruikt dit 's avonds (hoge prijzen)
                    </div>
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
                        <XAxis 
                          dataKey="month" 
                          stroke="#6b7a8f"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis 
                          stroke="#6b7a8f"
                          tick={{ fontSize: 11 }}
                          label={{ value: 'kWh', angle: -90, position: 'insideLeft', fill: '#6b7a8f', fontSize: 11 }}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            background: '#1a2744', 
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar 
                          dataKey="afname" 
                          name="Verbruik (gemeten)" 
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar 
                          dataKey="pvEstimate" 
                          name="PV Productie (geschat)" 
                          fill="#fbbf24"
                          radius={[4, 4, 0, 0]}
                        />
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
      <div style={{
        maxWidth: '1400px',
        margin: '32px auto 0',
        textAlign: 'center',
        fontSize: '12px',
        color: '#6b7a8f'
      }}>
        <p>
          Berekening gebaseerd op Belpex marktprijzen 2024 • Resultaten zijn schattingen en kunnen afwijken van werkelijke besparingen
        </p>
      </div>
    </div>
  );
}
