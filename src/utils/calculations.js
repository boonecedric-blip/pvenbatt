import {
  BELPEX_HOURLY_PROFILE_2024,
  BELPEX_MONTHLY_FACTORS,
  MONTHLY_PV_FACTORS,
  SUN_TIMES,
  DAYS_IN_MONTH,
  AFNAME_TOESLAG,
  INJECTIE_KOST,
  VASTE_PRIJS_KWH
} from '../data/constants';

// ============================================
// HULPFUNCTIES
// ============================================
export function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function calculatePVProduction(hour, month, day, annualProduction) {
  const [sunrise, sunset] = SUN_TIMES[month];
  
  if (hour < sunrise || hour > sunset) return 0;
  
  const dayLength = sunset - sunrise;
  const dayPosition = (hour - sunrise) / dayLength;
  const dailyFactor = Math.sin(Math.PI * dayPosition);
  
  const monthlyFactor = MONTHLY_PV_FACTORS[month];
  const daysInMonth = DAYS_IN_MONTH[month - 1];
  
  const monthlyProduction = annualProduction * monthlyFactor;
  const dailyProduction = monthlyProduction / daysInMonth;
  
  // Weather variation
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
  
  const intervalsPerDay = dayLength;
  const basePerHour = dailyProduction / (intervalsPerDay * 2 / Math.PI);
  
  return Math.max(0, dailyFactor * basePerHour * weatherFactor);
}

export function getBelpexPrice(hour, month) {
  const basePrice = BELPEX_HOURLY_PROFILE_2024[hour] || 70;
  const monthlyFactor = BELPEX_MONTHLY_FACTORS[month] || 1;
  return basePrice * monthlyFactor / 1000; // Convert to €/kWh
}

// ============================================
// CSV PARSER
// ============================================
export function parseFluviusCSV(csvText) {
  // Handle different line endings (Windows \r\n, Unix \n)
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const data = [];
  
  // Parse header to find column indices
  const header = lines[0].split(';').map(h => h.trim().toLowerCase().replace(/['"﻿]/g, ''));
  
  // Find column indices dynamically
  const dateIdx = header.findIndex(h => h.includes('van') && h.includes('datum'));
  const timeIdx = header.findIndex(h => h.includes('van') && h.includes('tijdstip'));
  const registerIdx = header.findIndex(h => h === 'register');
  const volumeIdx = header.findIndex(h => h === 'volume');
  const eenheidIdx = header.findIndex(h => h === 'eenheid');
  
  console.log('CSV Header analyse:', { dateIdx, timeIdx, registerIdx, volumeIdx, header });
  
  // Fallback to fixed positions if header detection fails
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
    
    // Skip injectie (klant heeft geen PV) en reactief vermogen (kVArh)
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
      year,
      month,
      day,
      hour,
      minute,
      afname: volume
    });
  }
  
  console.log(`Parsed ${data.length} records from CSV`);
  return data;
}

// ============================================
// SIMULATIE FUNCTIES
// ============================================
export function simulateCurrentSituation(data, fixedPrice) {
  let totalAfname = 0;
  let totalCost = 0;
  
  data.forEach(record => {
    totalAfname += record.afname;
    totalCost += record.afname * fixedPrice;
  });
  
  return {
    totalAfname,
    totalCost,
    avgPrice: totalCost / totalAfname
  };
}

export function simulatePVOnly(data, annualPVProduction) {
  let totalAfname = 0;
  let totalInjectie = 0;
  let totalPV = 0;
  let totalEigenverbruik = 0;
  let totalCost = 0;
  let totalOpbrengst = 0;
  
  // First pass: calculate total modeled PV to get scale factor
  let modeledPVTotal = 0;
  data.forEach(record => {
    const pvHour = calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction);
    modeledPVTotal += pvHour / 4; // Convert hourly rate to 15-min value
  });
  
  // Calculate scale factor based on data period vs full year
  const uniqueDays = new Set(data.map(r => `${r.year}-${r.month}-${r.day}`)).size;
  const expectedPV = annualPVProduction * (uniqueDays / 365);
  const scaleFactor = expectedPV / modeledPVTotal;
  
  data.forEach(record => {
    const pvHour = calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction);
    const pv = (pvHour / 4) * scaleFactor; // Scale to match annual production
    const verbruik = record.afname;
    
    const eigenverbruik = Math.min(pv, verbruik);
    const overschot = Math.max(0, pv - verbruik);
    const tekort = Math.max(0, verbruik - pv);
    
    const prijsAfname = VASTE_PRIJS_KWH;
    const prijsInjectie = getBelpexPrice(record.hour, record.month) - INJECTIE_KOST;
    
    totalPV += pv;
    totalEigenverbruik += eigenverbruik;
    totalInjectie += overschot;
    totalAfname += tekort;
    totalCost += tekort * prijsAfname;
    totalOpbrengst += overschot * Math.max(0, prijsInjectie);
  });
  
  return {
    totalAfname,
    totalInjectie,
    totalPV,
    totalEigenverbruik,
    totalCost,
    totalOpbrengst,
    nettoCost: totalCost - totalOpbrengst,
    zelfconsumptie: totalPV > 0 ? (totalEigenverbruik / totalPV) * 100 : 0
  };
}

export function simulateSmartBattery(data, annualPVProduction, batteryCapacity, batteryPower) {
  let totalAfname = 0;
  let totalInjectie = 0;
  let totalPV = 0;
  let totalEigenverbruik = 0;
  let totalCost = 0;
  let totalOpbrengst = 0;
  let totalCurtailed = 0;
  let totalArbitrage = 0;
  
  let soc = batteryCapacity * 0.5;
  const maxChargePerInterval = batteryPower / 4;
  const maxDischargePerInterval = batteryPower / 4;
  
  // First pass for scaling
  let modeledPVTotal = 0;
  data.forEach(record => {
    const pvHour = calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction);
    modeledPVTotal += pvHour / 4;
  });
  
  const uniqueDays = new Set(data.map(r => `${r.year}-${r.month}-${r.day}`)).size;
  const expectedPV = annualPVProduction * (uniqueDays / 365);
  const scaleFactor = modeledPVTotal > 0 ? expectedPV / modeledPVTotal : 1;
  
  // Calculate future values for lookahead
  const futureDeficits = new Array(data.length).fill(0);
  let runningDeficit = 0;
  for (let i = data.length - 1; i >= 0; i--) {
    const record = data[i];
    const pvHour = calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction);
    const pv = (pvHour / 4) * scaleFactor;
    const deficit = Math.max(0, record.afname - pv);
    runningDeficit += deficit;
    futureDeficits[i] = Math.min(runningDeficit, batteryCapacity * 2); // Limit lookahead
  }
  
  const hourlyData = [];
  
  data.forEach((record, idx) => {
    const pvHour = calculatePVProduction(record.hour + record.minute / 60, record.month, record.day, annualPVProduction);
    const pv = (pvHour / 4) * scaleFactor;
    const verbruik = record.afname;
    
    const prijsMarkt = getBelpexPrice(record.hour, record.month);
    const prijsAfname = prijsMarkt + AFNAME_TOESLAG;
    const prijsInjectie = prijsMarkt - INJECTIE_KOST;
    
    const maxCharge = Math.min(maxChargePerInterval, batteryCapacity - soc);
    const maxDischarge = Math.min(maxDischargePerInterval, soc);
    
    let charge = 0;
    let discharge = 0;
    let curtailed = 0;
    let injectPV = 0;
    let injectArb = 0;
    let netAfname = 0;
    
    // Step 1: PV for own consumption
    const pvForHouse = Math.min(pv, verbruik);
    let pvRemaining = pv - pvForHouse;
    let houseRemaining = verbruik - pvForHouse;
    
    // Step 2: PV surplus to battery
    charge = Math.min(pvRemaining, maxCharge);
    const pvAfterBattery = pvRemaining - charge;
    
    // Step 3: Remaining PV: inject or curtail
    if (prijsInjectie >= 0) {
      injectPV = pvAfterBattery;
    } else {
      curtailed = pvAfterBattery;
    }
    
    // Step 4: Cover deficit with battery
    if (houseRemaining > 0) {
      const dischargeForHouse = Math.min(houseRemaining, maxDischarge);
      discharge += dischargeForHouse;
      const gridToHouse = houseRemaining - dischargeForHouse;
      netAfname = gridToHouse;
    }
    
    // Step 5: Arbitrage at high prices
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
    
    // Update SoC
    soc = Math.max(0, Math.min(batteryCapacity, soc + charge - discharge));
    
    // Calculate costs
    totalPV += pv;
    totalEigenverbruik += pvForHouse + Math.min(discharge, houseRemaining);
    totalInjectie += injectPV + injectArb;
    totalAfname += netAfname;
    totalCurtailed += curtailed;
    totalArbitrage += injectArb;
    totalCost += netAfname * prijsAfname;
    totalOpbrengst += (injectPV + injectArb) * Math.max(0, prijsInjectie);
    
    // Store hourly data for visualization
    if (record.minute === 0 || idx === 0) {
      hourlyData.push({
        hour: record.hour,
        month: record.month,
        day: record.day,
        pv,
        verbruik,
        soc,
        prijsMarkt: prijsMarkt * 1000,
        netAfname,
        injectie: injectPV + injectArb
      });
    }
  });
  
  return {
    totalAfname,
    totalInjectie,
    totalPV,
    totalEigenverbruik,
    totalCost,
    totalOpbrengst,
    totalCurtailed,
    totalArbitrage,
    nettoCost: totalCost - totalOpbrengst,
    zelfconsumptie: totalPV > 0 ? (totalEigenverbruik / totalPV) * 100 : 0,
    hourlyData
  };
}

// ============================================
// FORMATTING FUNCTIES
// ============================================
export function formatCurrency(value) {
  return new Intl.NumberFormat('nl-BE', { 
    style: 'currency', 
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('nl-BE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}
