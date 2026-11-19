/*
  Agri-Share: Peer-to-peer agricultural machinery rental and crop marketplace
  Single-file React app: Tailwind CSS + Lucide icons. All state persists in localStorage.
*/
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
// Machine photos ship with the app (from Wikimedia Commons, resized to 640 px)
import imgTractor from "./assets/machines/tractor.jpg";
import imgHarvester from "./assets/machines/harvester.jpg";
import imgThresher from "./assets/machines/thresher.jpg";
import imgLeveler from "./assets/machines/leveler.jpg";
import imgSeeddrill from "./assets/machines/seeddrill.jpg";
import imgTransplanter from "./assets/machines/transplanter.jpg";
import imgDrone from "./assets/machines/drone.jpg";
import imgImplement from "./assets/machines/implement.jpg";
import {
  FIREBASE_ENABLED, FIRESTORE_DATABASE_ID, COL, watchCollection, watchDoc, writeDoc, removeDoc, readDoc,
  watchAuth, fbSignUp, fbSignIn, fbResetPassword, fbSignOut, fbStartPhone, fbConfirmPhone, fbSendVerification, fbRefreshUser,
} from "./firebase.js";
import {
  Tractor, Wheat, Search, MapPin, Fuel, User, Truck, CalendarDays, Clock, X, Check,
  ChevronRight, Languages, Store, ClipboardList, Phone, MessageCircle, Send, Bot, Sparkles,
  Plus, Trash2, Star, Info, ShieldCheck, Wallet, Calculator, Users, Sprout, Smartphone,
  Delete, PhoneCall, PhoneOff, CircleCheck, Hourglass, Ban, BadgeCheck, SlidersHorizontal,
  RotateCcw, Fan, Minus, GraduationCap, HandCoins, Signal, Battery, Eye, EyeOff, Handshake,
  Coins, ArrowRight, Megaphone, LogIn, LogOut, UserPlus, KeyRound, Mail, Lock, UserCircle2, Copy, MessageSquareText, Tag, Repeat, Database, Radar, Gauge, Siren, TriangleAlert, Route, Zap, LocateFixed, Crosshair, Mic, MicOff, Volume2, VolumeX, AudioLines, PlayCircle, Drone, Ruler, Shovel, Globe, Droplets, Camera, Activity, Headphones, Percent, Printer, Download, Ticket, Inbox, Menu,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Constants from the report                                           */
/* ------------------------------------------------------------------ */
const OPERATOR_RATE = 500; // PKR per hour
const TRANSPORT_PER_KM = 100; // PKR per km, distance based (illustrative)
const TRANSPORT_MIN = 500; // minimum transport charge
const MIN_OFFER_RATIO = 0.6; // an offer must be at least 60% of the listed rate
const transportFee = (km) => Math.max(trMin(), Math.round(((Number(km) || 0) * trKm()) / 50) * 50);
const COMMISSION = 0.06; // standard platform commission (5% to 7% range)
const SMALLHOLDER_COMMISSION = 0.04; // subsidised rate for smallholders farming under 5 acres
const ADVANCE_SHARE = 0.3; // Harvest Now, Pay Later: 30% advance, 70% after harvest (credit by a third-party partner)
const CREDIT_PARTNERS = ["JazzCash Credit", "EasyPaisa", "ZTBL"]; // proposed partners only, no agreement exists
const pctLabel = (r) => Math.round(r * 100) + "%";
const DEFAULT_RADIUS = 15; // proposed in-app search boundary
const MAX_RADIUS = 25; // upper end of 15 to 25 km catchment
const DISTRICTS = ["Lahore Rural", "Kasur", "Sheikhupura", "Okara", "Faisalabad", "Sahiwal"];
const CATEGORIES = ["tractor", "thresher", "harvester", "leveler", "planter", "drone", "implement"];

/* ------------------------------------------------------------------ */
/* Real machine photos (Wikimedia Commons, freely licensed), bundled   */
/* with the app so they load instantly and work offline. If one ever   */
/* fails, a drawn card is shown. Photos show the machine type, not     */
/* always the exact model.                                             */
/* ------------------------------------------------------------------ */
const commonsUrl = (file, w = 640) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
const commonsPage = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
const MACHINE_PHOTOS = {
  tractor: { src: imgTractor, file: "Massey_Ferguson_275_tractor_(16262123916).jpg", label: "Massey Ferguson 275 tractor", credit: "Bob Adams, CC BY-SA 2.0" },
  harvester: { src: imgHarvester, file: "Grain_Harvesting_Machine.JPG", label: "Claas Crop Tiger combines, Kerala", credit: "Wikimedia Commons" },
  thresher: { src: imgThresher, file: "Wheat_thresher_charsadda.jpg", label: "Wheat thresher, Charsadda (KP)", credit: "Wikimedia Commons" },
  leveler: { src: imgLeveler, file: "Agriculture_Land_leveler_02.jpg", label: "Tractor-mounted land leveller", credit: "Wikimedia Commons" },
  seeddrill: { src: imgSeeddrill, file: "Disc_Harrow_Seed_Drill.jpg", label: "Tractor-mounted seed drill", credit: "Wikimedia Commons" },
  transplanter: { src: imgTransplanter, file: "Rice-planting-machine_2,katori-city,japan.JPG", label: "Rice transplanter", credit: "katorisi, GFDL" },
  drone: { src: imgDrone, file: "DJI_Agras_T50_demonstrating_sprayers_in_flight.jpg", label: "DJI Agras T50 spray drone", credit: "Wikimedia Commons" },
  implement: { src: imgImplement, file: "Renault_50_tractor.jpg", label: "Tractor with rotary tiller", credit: "Joost J. Bakker, CC BY 2.0" },
};
const CAT_PHOTO = { tractor: "tractor", harvester: "harvester", thresher: "thresher", leveler: "leveler", planter: "seeddrill", drone: "drone", implement: "implement" };

/* ------------------------------------------------------------------ */
/* Country / region catalogs                                           */
/* fx = local currency units per 1 PKR. Reference mid-market rates,    */
/* Nov 2026: 1 USD ~ 278 PKR ~ 6.67 CNY ~ 94 INR (illustrative).       */
/* All amounts are stored in PKR and converted for display.            */
/* Hourly rate ranges and diesel prices are indicative sample values.  */
/* ------------------------------------------------------------------ */
const USD_PKR = 278;
const COUNTRIES = {
  PK: {
    id: "PK", flag: "🇵🇰", code: "PKR", symbol: "PKR ", locale: "en-PK", fx: 1, diesel: null, transportKm: 100, transportMin: 500, longKm: 60, nudge: 100,
    owners: null,
    catalog: [
      { name: "Massey Ferguson 385", cat: "tractor", spec: "85 HP · 2WD", min: 2500, max: 3500 },
      { name: "New Holland Ghazi 65HP", cat: "tractor", spec: "65 HP · 2WD", min: 2000, max: 3000 },
      { name: "Fiat 640", cat: "tractor", spec: "64 HP · 2WD", min: 1800, max: 2800 },
      { name: "Pak Wheat Thresher", cat: "thresher", spec: "PTO driven · about 1.5 to 2 t/hr", min: 1600, max: 2400 },
      { name: "Kubota / local Combine Harvester", cat: "harvester", spec: "70 to 100 HP · rice and wheat header", min: 7000, max: 10000 },
      { name: "Laser Land Leveler", cat: "leveler", spec: "Laser-guided bucket · needs 60 to 85 HP tractor", min: 2500, max: 3500 },
    ],
  },
  CN: {
    id: "CN", flag: "🇨🇳", code: "CNY", symbol: "¥", locale: "zh-CN", fx: 6.67 / USD_PKR, diesel: 7.4, transportKm: 3, transportMin: 30, longKm: 2.5, nudge: 10,
    owners: ["Wang Jianguo", "Li Ming", "Zhang Wei", "Liu Yang", "Chen Hua", "Zhao Lei", "Sun Qiang", "Zhou Bin"],
    catalog: [
      { name: "Dongfeng DF-504 Tractor", cat: "tractor", spec: "50 HP · 4WD", min: 80, max: 120 },
      { name: "Lovol M904 Tractor", cat: "tractor", spec: "90 HP · 4WD", min: 120, max: 180 },
      { name: "YTO X1204 Heavy Tractor", cat: "tractor", spec: "120 HP · heavy duty", min: 160, max: 240 },
      { name: "World Ruilong Combine Harvester", cat: "harvester", spec: "about 100 HP · 2 m header", min: 250, max: 400 },
      { name: "Paddy Transplanter (6-row)", cat: "planter", spec: "6 rows · about 4 to 6 mu/hr", min: 100, max: 160, photo: "transplanter" },
      { name: "DJI Agras Spray Drone", cat: "drone", spec: "40 L tank · battery powered", min: 300, max: 500 },
    ],
    regions: [
      { name: "Zhengzhou", province: "Henan", lat: 34.75, lng: 113.62 }, { name: "Kaifeng", province: "Henan", lat: 34.79, lng: 114.31 },
      { name: "Harbin", province: "Heilongjiang", lat: 45.75, lng: 126.65 }, { name: "Jinan", province: "Shandong", lat: 36.65, lng: 117.0 },
      { name: "Shijiazhuang", province: "Hebei", lat: 38.04, lng: 114.51 }, { name: "Nanjing", province: "Jiangsu", lat: 32.06, lng: 118.8 },
      { name: "Hefei", province: "Anhui", lat: 31.82, lng: 117.23 }, { name: "Wuhan", province: "Hubei", lat: 30.59, lng: 114.3 },
      { name: "Changsha", province: "Hunan", lat: 28.23, lng: 112.94 }, { name: "Chengdu", province: "Sichuan", lat: 30.66, lng: 104.06 },
      { name: "Changchun", province: "Jilin", lat: 43.88, lng: 125.32 }, { name: "Urumqi", province: "Xinjiang", lat: 43.83, lng: 87.62 },
    ],
  },
  IN: {
    id: "IN", flag: "🇮🇳", code: "INR", symbol: "₹", locale: "en-IN", fx: 94 / USD_PKR, diesel: 90, transportKm: 25, transportMin: 200, longKm: 20, nudge: 50,
    owners: ["Gurpreet Singh", "Rajesh Kumar", "Harjit Sandhu", "Suresh Patel", "Amit Yadav", "Baldev Singh", "Vikram Chauhan", "Ramesh Reddy"],
    catalog: [
      { name: "Mahindra Arjun Novo 605", cat: "tractor", spec: "57 HP · 2WD", min: 800, max: 1200 },
      { name: "Swaraj 855 FE", cat: "tractor", spec: "52 HP · 2WD", min: 700, max: 1100 },
      { name: "Sonalika DI 750", cat: "tractor", spec: "55 HP · 2WD", min: 700, max: 1100 },
      { name: "Multi-Crop Thresher", cat: "thresher", spec: "PTO · wheat, soybean, gram", min: 900, max: 1400 },
      { name: "Rotavator", cat: "implement", spec: "6 to 7 ft · needs 45+ HP tractor", min: 900, max: 1400 },
    ],
    regions: [
      { name: "Ludhiana", province: "Punjab", lat: 30.9, lng: 75.85 }, { name: "Karnal", province: "Haryana", lat: 29.69, lng: 76.99 },
      { name: "Meerut", province: "Uttar Pradesh", lat: 28.98, lng: 77.71 }, { name: "Lucknow", province: "Uttar Pradesh", lat: 26.85, lng: 80.95 },
      { name: "Bhopal", province: "Madhya Pradesh", lat: 23.26, lng: 77.41 }, { name: "Nashik", province: "Maharashtra", lat: 20.0, lng: 73.79 },
      { name: "Jaipur", province: "Rajasthan", lat: 26.91, lng: 75.79 }, { name: "Ahmedabad", province: "Gujarat", lat: 23.02, lng: 72.57 },
      { name: "Patna", province: "Bihar", lat: 25.59, lng: 85.14 }, { name: "Bardhaman", province: "West Bengal", lat: 23.23, lng: 87.86 },
      { name: "Guntur", province: "Andhra Pradesh", lat: 16.31, lng: 80.44 }, { name: "Thanjavur", province: "Tamil Nadu", lat: 10.79, lng: 79.14 },
    ],
  },
  US: {
    id: "US", flag: "🇺🇸", code: "USD", symbol: "$", locale: "en-US", fx: 1 / USD_PKR, diesel: 1.05, transportKm: 2.5, transportMin: 50, longKm: 2, nudge: 5,
    owners: ["John Miller", "Emily Johnson", "Hans Becker", "Pierre Martin", "Tom Anderson", "Sarah Davis", "Lukas Weber", "Mark Wilson"],
    catalog: [
      { name: "John Deere 6155M", cat: "tractor", spec: "155 HP", min: 70, max: 110 },
      { name: "Case IH Magnum", cat: "tractor", spec: "250 to 380 HP", min: 120, max: 180 },
      { name: "Claas Lexion Combine Harvester", cat: "harvester", spec: "Class 7 to 9 combine", min: 250, max: 400 },
      { name: "Fendt 724 Vario", cat: "tractor", spec: "240 HP · CVT", min: 100, max: 150 },
    ],
    regions: [
      { name: "Des Moines", province: "Iowa, USA", lat: 41.59, lng: -93.62 }, { name: "Wichita", province: "Kansas, USA", lat: 37.69, lng: -97.34 },
      { name: "Lincoln", province: "Nebraska, USA", lat: 40.81, lng: -96.7 }, { name: "Champaign", province: "Illinois, USA", lat: 40.12, lng: -88.24 },
      { name: "Fresno", province: "California, USA", lat: 36.74, lng: -119.79 }, { name: "Fargo", province: "North Dakota, USA", lat: 46.88, lng: -96.79 },
      { name: "Hannover", province: "Lower Saxony, Germany", lat: 52.37, lng: 9.73 }, { name: "Chartres", province: "Centre-Val de Loire, France", lat: 48.45, lng: 1.49 },
      { name: "Lincoln", province: "Lincolnshire, UK", lat: 53.23, lng: -0.54 }, { name: "Lelystad", province: "Flevoland, Netherlands", lat: 52.52, lng: 5.47 },
      { name: "Poznań", province: "Greater Poland, Poland", lat: 52.41, lng: 16.93 }, { name: "Valladolid", province: "Castile and León, Spain", lat: 41.65, lng: -4.72 },
    ],
  },
  ME: {
    id: "ME", flag: "🌍", code: "USD", symbol: "$", locale: "en-US", fx: 1 / USD_PKR, diesel: 0.75, transportKm: 0.8, transportMin: 15, longKm: 0.6, nudge: 2,
    owners: ["Ahmed Hassan", "Joseph Kamau", "Omar Al-Harbi", "Fatima Diallo", "Samuel Okoro", "Youssef Benali", "Grace Wanjiru", "Khalid Mansour"],
    catalog: [
      { name: "Massey Ferguson 290", cat: "tractor", spec: "80 HP · 2WD", min: 15, max: 25 },
      { name: "John Deere 5075E", cat: "tractor", spec: "75 HP", min: 20, max: 30 },
      { name: "Solar Water Pump", cat: "implement", spec: "5 to 7.5 kW · portable", min: 5, max: 10, photo: null },
      { name: "Subsoiler", cat: "implement", spec: "3-shank · needs 75+ HP tractor", min: 20, max: 35 },
    ],
    regions: [
      { name: "Nakuru", province: "Kenya", lat: -0.3, lng: 36.07 }, { name: "Arusha", province: "Tanzania", lat: -3.37, lng: 36.68 },
      { name: "Kano", province: "Nigeria", lat: 12.0, lng: 8.52 }, { name: "Adama", province: "Ethiopia", lat: 8.54, lng: 39.27 },
      { name: "Bloemfontein", province: "South Africa", lat: -29.12, lng: 26.21 }, { name: "Meknes", province: "Morocco", lat: 33.9, lng: -5.55 },
      { name: "Tanta", province: "Egypt", lat: 30.79, lng: 31.0 }, { name: "Al-Kharj", province: "Saudi Arabia", lat: 24.15, lng: 47.31 },
      { name: "Al Ain", province: "UAE", lat: 24.21, lng: 55.74 }, { name: "Irbid", province: "Jordan", lat: 32.55, lng: 35.85 },
      { name: "Konya", province: "Türkiye", lat: 37.87, lng: 32.48 },
    ],
  },
};
const COUNTRY_IDS = Object.keys(COUNTRIES);
// Current display country. App sets this on every render before its children render.
let CUR = COUNTRIES.PK;
const MODEL_INDEX = COUNTRY_IDS.flatMap((cc) => COUNTRIES[cc].catalog.map((m) => ({ ...m, country: cc })));
const findModel = (name) => {
  const n = String(name || "").toLowerCase();
  return MODEL_INDEX.find((m) => n === m.name.toLowerCase()) || MODEL_INDEX.find((m) => n.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(n) && n.length > 6) || null;
};
const photoKeyFor = (category, name) => {
  const m = name ? findModel(name) : null;
  if (m && m.cat === category && m.photo !== undefined) return m.photo;
  return CAT_PHOTO[category] || null;
};
const catalogCats = (cc) => [...new Set(COUNTRIES[cc].catalog.map((m) => m.cat))];
// Typical owner ask for a category in the current country, in PKR (catalog mid-point)
const askFor = (category, fallback) => {
  const ms = CUR.catalog.filter((m) => m.cat === category);
  if (!ms.length) return fallback;
  const mid = ms.reduce((s, m) => s + (m.min + m.max) / 2, 0) / ms.length;
  return mid / CUR.fx;
};
const toLocal = (pkrV) => Math.round(Number(pkrV || 0) * CUR.fx * 100) / 100;
const fromLocal = (v) => Number(v || 0) / CUR.fx;
const fmtLocal = (v, cur = CUR) => {
  const abs = Math.abs(v);
  const dec = cur.id === "PK" || cur.code === "INR" || abs === 0 ? 0 : abs >= 10 ? 0 : cur.code === "USD" ? 2 : 1;
  return cur.symbol + Number(v).toLocaleString(cur.locale === "zh-CN" ? "en-US" : cur.locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};
// transport tariffs in PKR for the current country
const trKm = () => (CUR.id === "PK" ? TRANSPORT_PER_KM : CUR.transportKm / CUR.fx);
const trMin = () => (CUR.id === "PK" ? TRANSPORT_MIN : CUR.transportMin / CUR.fx);
const trLong = () => (CUR.id === "PK" ? 60 : CUR.longKm / CUR.fx);

// Sample listings outside Pakistan (rates stored in PKR, converted for display)
const INTL_SEEDS = [
  ["C1", "CN", "Lovol M904 Tractor", "tractor", "Zhengzhou", "Henan", "Xinzheng", 34.53, 113.74, 150, "Wang Jianguo", "90 HP, 4WD, rotary tiller available"],
  ["C2", "CN", "World Ruilong Combine Harvester", "harvester", "Kaifeng", "Henan", "Weishi", 34.41, 114.19, 320, "Li Ming", "Wheat header, grain tank unloading"],
  ["C3", "CN", "DJI Agras Spray Drone", "drone", "Zhengzhou", "Henan", "Xingyang", 34.79, 113.38, 400, "Zhang Wei", "Licensed pilot, 40 L tank"],
  ["I1", "IN", "Mahindra Arjun Novo 605", "tractor", "Ludhiana", "Punjab", "Doraha", 30.8, 76.03, 1000, "Gurpreet Singh", "57 HP, cultivator and trolley"],
  ["I2", "IN", "Multi-Crop Thresher", "thresher", "Ludhiana", "Punjab", "Sahnewal", 30.85, 75.95, 1150, "Harjit Sandhu", "Wheat and soybean sieves"],
  ["I3", "IN", "Rotavator", "implement", "Ludhiana", "Punjab", "Mullanpur", 30.85, 75.66, 1100, "Baldev Singh", "7 ft, tractor included"],
  ["U1", "US", "John Deere 6155M", "tractor", "Des Moines", "Iowa, USA", "Altoona", 41.64, -93.46, 90, "John Miller", "155 HP, GPS autosteer"],
  ["U2", "US", "Claas Lexion Combine Harvester", "harvester", "Des Moines", "Iowa, USA", "Ankeny", 41.73, -93.6, 320, "Emily Johnson", "Corn and soybean headers, operator included"],
  ["U3", "US", "Fendt 724 Vario", "tractor", "Des Moines", "Iowa, USA", "Indianola", 41.36, -93.56, 125, "Tom Anderson", "240 HP, front linkage"],
  ["M1", "ME", "Massey Ferguson 290", "tractor", "Nakuru", "Kenya", "Njoro", -0.33, 35.94, 20, "Joseph Kamau", "80 HP, disc plough"],
  ["M2", "ME", "John Deere 5075E", "tractor", "Nakuru", "Kenya", "Molo", -0.25, 35.73, 25, "Grace Wanjiru", "75 HP, 4WD"],
  ["M3", "ME", "Solar Water Pump", "implement", "Nakuru", "Kenya", "Rongai", -0.17, 35.86, 8, "Samuel Okoro", "Portable 5 kW, pipes included"],
].map(([id, cc, name, category, district, province, village, lat, lng, local, ownerName, spec], i) => ({
  id, country: cc, name, category, district, province, village, lat, lng, distance: 5 + i,
  rate: Math.round(local / COUNTRIES[cc].fx), operator: "included", transport: "optional", ownerName, ownerId: "AS-" + (5100 + i * 7), spec, rating: Math.round((4.3 + (i % 5) * 0.12) * 10) / 10, available: true,
}));

const SEED_LISTINGS = [
  { id: "L1", name: "Massey Ferguson 385 Tractor", category: "tractor", district: "Lahore Rural", village: "Raiwind", distance: 4.2, rate: 2500, operator: "optional", transport: "optional", ownerName: "Ch. Muhammad Akram", ownerId: "AS-1042", spec: "85 HP, rotavator and cultivator available", rating: 4.7, available: true },
  { id: "L2", name: "New Holland Ghazi 65HP Tractor", category: "tractor", district: "Kasur", village: "Chunian", distance: 7.8, rate: 2300, operator: "included", transport: "optional", ownerName: "Malik Riaz Ahmad", ownerId: "AS-1107", spec: "65 HP, disc plough and leveller", rating: 4.5, available: true },
  { id: "L3", name: "Pak Wheat Thresher", category: "thresher", district: "Sheikhupura", village: "Muridke", distance: 11.5, rate: 1800, operator: "included", transport: "optional", ownerName: "Rana Tariq Mehmood", ownerId: "AS-1163", spec: "Tractor PTO driven, wheat straw (bhoosa) output", rating: 4.4, available: true },
  { id: "L4", name: "Maize Thresher", category: "thresher", district: "Okara", village: "Renala Khurd", distance: 14.0, rate: 2000, operator: "optional", transport: "included", ownerName: "Sardar Iqbal Wattoo", ownerId: "AS-1219", spec: "Maize sheller, PTO driven", rating: 4.3, available: true },
  { id: "L5", name: "Kubota Combine Harvester", category: "harvester", district: "Faisalabad", village: "Jaranwala", distance: 18.6, rate: 8500, operator: "included", transport: "optional", ownerName: "Haji Nawaz Bajwa", ownerId: "AS-1284", spec: "Rice and wheat header, trained operator", rating: 4.8, available: true },
  { id: "L6", name: "New Holland Wheat Harvester", category: "harvester", district: "Sahiwal", village: "Chichawatni", distance: 22.3, rate: 9000, operator: "included", transport: "optional", ownerName: "Mian Shahid Arain", ownerId: "AS-1330", spec: "Wheat combine, grain tank unloading", rating: 4.6, available: true },
];

// Owner service locations for the sample listings (approximate village centres)
const SEED_COORDS = { L1: [31.25, 74.22], L2: [30.96, 73.98], L3: [31.8, 74.26], L4: [30.88, 73.6], L5: [31.33, 73.42], L6: [30.53, 72.69] };
SEED_LISTINGS.forEach((l) => { const c = SEED_COORDS[l.id]; if (c) { l.lat = c[0]; l.lng = c[1]; l.province = "PB"; l.country = "PK"; } });
SEED_LISTINGS.push(...INTL_SEEDS);
// Sample listings are shown only in Demo mode; Live Public Mode shows real owner listings only
const SEED_IDS = new Set(SEED_LISTINGS.map((l) => l.id));
const isSeedListing = (l) => SEED_IDS.has(l.id) || !!l.demo;
const PRIORITY_DISCOUNT_PCT = 10;

/* ------------------------------------------------------------------ */
/* Translations: English, Urdu, Punjabi (Shahmukhi), Sindhi (preview)  */
/* ------------------------------------------------------------------ */
const LANGS = [
  { code: "en", label: "English", name: "English", dir: "ltr", html: "en" },
  { code: "ur", label: "اردو (Urdu)", name: "Urdu", dir: "rtl", html: "ur" },
  { code: "pa", label: "پنجابی (Punjabi)", name: "Punjabi (Shahmukhi script)", dir: "rtl", html: "pnb" },
  { code: "sd", label: "سنڌي (Sindhi)", name: "Sindhi", dir: "rtl", html: "sd", expansion: true },
  { code: "ps", label: "پښتو (Pashto)", name: "Pashto", dir: "rtl", html: "ps", expansion: true },
  { code: "bal", label: "بلوچی (Balochi)", name: "Balochi", dir: "rtl", html: "bal", expansion: true },
];
// Pashto and Balochi cover navigation, hero, marketplace, booking, payments, Agri-Market and the helper.
// Any other screen falls back to Urdu (same script, widely read), then English.
const RTL_FALLBACK = "ur";

const T = {
  en: {
    vc_mic_blocked: "Microphone permission denied. Allow the microphone in your browser settings, then tap to speak again.",
    vc_demo_btn: "Hear an example",
    vc_retry: "Try the microphone again",
    vc_no_mic: "No microphone found. Plug one in, then tap to speak again.",
    vc_net: "Voice recognition needs internet. Check the connection, then tap to speak again.",
    vc_lang_unsupported: "This browser cannot listen in this language. Try Chrome, or tap 'Hear an example'.",
    vc_no_voice: "No Urdu voice is installed on this device, so replies are read in Roman Urdu. To hear Urdu, install an Urdu voice (Android: Settings > Text-to-speech).",
    nav_activity: "Activity",
    nav_s_market: "Market",
    nav_s_live: "Request",
    nav_s_mandi: "Sell crop",
    nav_s_bookings: "Bookings",
    nav_s_owner: "Owner",
    nav_s_agent: "Agent",
    nav_s_more: "More",
    hero_role_farmer: "Farmer",
    hero_need: "Need a machine?",
    hero_role_owner: "Owner",
    hero_earn: "Earn from your machinery",
    hero_live: "Live on Agri-Share",
    hero_machines: "machines listed in this region",
    hero_owners: "owners",
    hero_bookings: "bookings made on this device",
    tr1_t: "Verified owners",
    tr1_s: "Every listing is reviewed by the Agri-Share team before it goes live",
    tr2_t: "4% to 6% fair commission",
    tr2_s: "Only 4% for smallholders under 5 acres",
    tr3_t: "30/70 harvest credit",
    tr3_s: "Pay 30% now, 70% after harvest (proposed partners)",
    tr4_t: "24/7 helpline & voice help",
    tr4_s: "Toll-free UAN and the Kisan Helper voice assistant",
    ov_dry: "Dry rent",
    ov_op: "Operator incl.",
    toast_broadcast_t: "Request broadcast",
    toast_broadcast: "Sent to {n} nearby owners. The search widens automatically if no one accepts.",
    toast_broadcast0: "Searching for owners nearby. The search widens automatically.",
    toast_booked_t: "Booking placed",
    toast_offer_t: "Offer sent",
    toast_synced: "Synced to the cloud.",
    toast_local: "Saved on this device.",
    act_title: "My activity",
    act_sub: "Bookings, live requests and Agri-Market deals in one place",
    act_bookings: "Bookings",
    act_requests: "Requests",
    act_deals: "Deals",
    act_voucher: "Voucher",
    act_view_voucher: "View voucher",
    act_empty_b: "No bookings yet.",
    act_empty_r: "No live requests yet.",
    act_empty_d: "No crop posts yet.",
    act_all: "Open full bookings page",
    act_sold: "Sold",
    act_open: "Open",
    vo_title: "Digital booking voucher",
    vo_ref: "Ref",
    vo_issued: "Issued",
    vo_verified: "Booking recorded on Agri-Share",
    vo_cancelled: "This booking was cancelled or declined",
    vo_track: "Live status",
    vo_s1: "Owner confirmed",
    vo_s2: "Machine en route",
    vo_s3: "Work completed",
    vo_waiting: "Waiting for the owner to confirm.",
    vo_mark_route: "Owner: mark machine en route",
    vo_machine: "Machine",
    vo_date: "Date & hours",
    vo_location: "District",
    vo_renter: "Farmer",
    vo_items: "Cost breakdown",
    vo_total: "Total payable",
    vo_fuel: "Diesel estimate",
    vo_print: "Print / Save PDF",
    vo_download: "Download",
    vo_close: "Close",
    vo_note: "Show this booking ID to the owner or your Agri-Agent.",
    vo_pattern_note: "Show this badge and booking ID to the owner at hand-over.",
    lr_diesel_note_intl: "Typical pump price for this region. The renter pays fuel directly in dry rent.",
    country: "Country / region",
    country_PK: "Pakistan",
    country_CN: "China",
    country_IN: "India",
    country_US: "USA / Europe",
    country_ME: "Middle East / Africa",
    fx_note: "Prices shown in local currency at reference rates (1 USD ≈ 278 PKR ≈ 6.67 CNY ≈ 94 INR). Regional rates are market estimates.",
    one_leveler: "Laser Land Leveler",
    one_planter: "Seed Drill / Planter",
    one_drone: "Spray Drone",
    one_implement: "Implement / Pump",
    cat_leveler: "Levelers",
    cat_planter: "Planters",
    cat_drone: "Drones",
    cat_implement: "Implements",
    lr_steps: "Request steps",
    lr_step1: "Machine type",
    lr_step2: "Location & offer",
    lr_step3: "Live offers",
    lr_step_locked: "Start a new request to change the machine or offer.",
    ad403_title: "403 — Authorized Agri-Share Administration Only",
    ow_ownerphone: "Owner phone (calls & WhatsApp)",
    al_title: "New Activity Alerts",
    al_sub: "{n} item(s) need attention",
    al_none: "All caught up. New listings and farmer requests appear here instantly.",
    al_listing: "New machine awaiting approval",
    al_request: "Farmer request",
    al_demand: "Waiting demand ticket",
    al_booking: "Booking awaiting owner",
    al_view: "Review",
    ad_live: "Live Requests & Bookings",
    ad_live_req: "Apni Boli machinery requests",
    ad_live_bk: "Bookings",
    ct_call: "Call",
    ct_wa: "WhatsApp",
    ct_none: "No phone on file",
    ct_owner: "Owner",
    ct_farmer: "Farmer",
    ct_rent_dry: "Dry rent (renter buys diesel)",
    ct_rent_wet: "Wet rent (diesel included)",
    ct_model: "Machine",
    ct_rate: "Hourly rate",
    ct_offered: "Offered",
    ct_needed: "Machine needed",
    ct_location: "Location",
    ct_time: "Submitted",
    ad403_sub: "This area is restricted to the Agri-Share founder and authorised team administrators.",
    ad403_signin: "Sign in with an admin account",
    ad403_home: "Back to marketplace",
    adv_title: "Verify your email to continue",
    adv_sub: "Admin access needs a verified email address ({email}). We will send a verification link.",
    adv_send: "Send verification email",
    adv_sent: "Verification email sent. Open the link, then tap \"I've verified\".",
    adv_check: "I've verified",
    adv_still: "Your email is not verified yet.",
    adp_create_title: "Create a new Admin Password",
    adp_create_sub: "First-time setup. This password unlocks the Agri-Share control room. Only its salted SHA-256 hash is stored.",
    adp_enter_title: "Founder PIN",
    adp_enter_sub: "Signed in as {email}. The secondary PIN is switched on: enter it to open the control room.",
    adp_opening: "Opening the control room",
    adp_new: "New PIN",
    adp_confirm: "Confirm password",
    adp_current: "Current PIN",
    adp_pass: "PIN",
    adp_save: "Save & unlock",
    adp_unlock: "Unlock control room",
    adp_short: "Use at least {n} characters.",
    adp_mismatch: "The passwords do not match.",
    adp_wrong: "Wrong PIN.",
    adp_locked: "Too many attempts. Try again in {s} seconds.",
    adp_waiting: "The founder has not set an admin password yet.",
    adp_load_err: "Could not refresh your account. Check the connection and try again.",
    adp_offline: "Firestore could not be reached, so this browser's saved admin settings are used. They sync when the connection returns.",
    adp_cloud_queued: "Saved. It will sync to Firestore when the connection returns.",
    adp_cloud_denied: "Firestore refused the change. Publish the latest firestore.rules and make sure your email is verified.",
    adp_save_err: "Could not save. Check the connection and that firestore.rules are published.",
    ads_tab: "Security",
    ads_title: "Security & Admin Password",
    ads_change: "Change PIN",
    ads_changed: "PIN changed. It now applies on every device.",
    ads_founder_only: "Only the founder can change the PIN and team list.",
    ads_pin_title: "Founder Session Lock (optional PIN)",
    ads_pin_sub: "Off by default: your verified founder email opens the Admin Panel on any device. Turn this on to also ask for a PIN. It is stored only in Firestore, so the same PIN works on every device.",
    ads_pin_status_on: "PIN on",
    ads_pin_status_off: "PIN off",
    ads_pin_enable: "Turn on PIN",
    ads_pin_disable: "Turn off PIN",
    ads_pin_on: "PIN switched on for every device.",
    ads_pin_off: "PIN switched off. Your verified email opens the Admin Panel.",
    ads_team: "Authorised team admins",
    ads_team_sub: "Team admins open the Admin Panel with their own verified email (plus the PIN, if it is switched on).",
    ads_team_add: "Add",
    ads_team_none: "No team admins yet.",
    ads_team_saved: "Team admin list saved.",
    ads_founder: "Founder",
    ads_last: "Password last changed {d} by {e}",
    lr_listed: "Listed rate · owner confirms",
    toast_lr_sent: "Request sent to {owner}. They confirm from their Owner Portal.",
    mode_live: "Live Public Mode",
    mode_live_d: "Real registered owners only. Only machinery posted and approved via the Owner Portal is shown.",
    mode_demo: "Sample Demo Data",
    mode_demo_d: "Adds sample tractors and simulated owner counter-offers for testing every flow.",
    mode_title: "Marketplace mode",
    mode_sub: "Public visitors always see Live Public Mode. Sample data is switched on only on this device.",
    mode_load_demo: "Load Sample Demo Data",
    mode_go_live: "Switch to Live Public Mode",
    mode_badge_live: "Live · verified owners only",
    mode_badge_demo: "Demo data on",
    toast_mode_live: "Live Public Mode: showing real registered owners only.",
    toast_mode_demo: "Sample demo data loaded on this device.",
    zs_title: "Agri-Share Assisted Fulfillment & Partner Network",
    zs_sub: "No registered owner is online near {place} for a {machine} yet. We will still get your field covered. Pick one:",
    zs_a: "Expand search radius to 100 km",
    zs_a_d: "Broadcast your request to verified owners in neighbouring tehsils and districts. Transport and fuel are shown up front:",
    zs_a_btn: "Broadcast to 100 km",
    zs_a_done: "Already searching up to 100 km.",
    zs_km: "{km} km away",
    zs_transport: "Transport",
    zs_fuel: "Diesel",
    zs_total: "Est. total",
    zs_b: "Village Agri-Agent & Local Partner Dispatch",
    zs_b_d: "Send the request to our Local Agri-Agent & Partner Rental Hub Network. Our ground team calls offline village tractor owners and confirms with you by SMS or call within 2 to 4 hours.",
    zs_b_btn: "Send to Agri-Agent team",
    zs_b_done: "Ticket {id}: an Agri-Agent will call you on {phone} within 2 to 4 hours.",
    zs_c: "Notify me & earn a priority discount",
    zs_c_d: "We save your request. The moment an owner registers in {district}, they see you as a waiting customer, and you get {pct}% off the platform fee on that booking.",
    zs_c_btn: "Notify me",
    zs_c_done: "Saved ({id}). We will alert you as soon as an owner registers in {district}.",
    zs_phone: "Phone for the call-back",
    zs_machine: "Machine needed",
    zs_saved_local: "(saved on this device until the connection returns)",
    ow_waiting: "Farmers waiting in your district",
    ow_waiting_sub: "Real requests saved while no owner was registered here. List a matching machine and contact them first.",
    ow_waiting_none: "No waiting farmers right now.",
    ow_waiting_list: "List a matching machine",
    toast_waiting: "{n} farmer(s) are already waiting for a {machine} in {district}.",
    ad_demand: "Waiting demand",
    ad_demand_none: "No waiting demand yet.",
    ad_demand_contacted: "Mark contacted",
    ad_demand_matched: "Mark matched",
    dm_waiting: "Waiting", dm_contacted: "Contacted", dm_matched: "Matched",
    dm_agent_dispatch: "Agri-Agent dispatch", dm_notify: "Notify me",
    lr_choose: "Which machine do you need?",
    lr_choose_sub: "Tap a machine type first, then name your price. Models and rates for {country}.",
    cat_rates_note: "Typical market ranges, not quotes.",
    lr_est_rate: "Est. hourly rate",
    lr_select: "Select & continue",
    lr_selected: "Selected",
    lr_change_machine: "Change",
    lr_pref_model: "Preferred model (optional)",
    lr_any_model: "Any model",
    lr_diesel_intl: "Local diesel price: {v}/L",
    lr_fuel_battery: "Battery powered: no diesel needed.",
    ow_suggest: "Suggested models in {country} (tap to fill name, spec and rate)",
    loc_sub_intl: "Pick a region, type your village or farm, or use GPS.",
    loc_regions: "Farming regions",
    loc_map_pk_only: "The interactive map covers Pakistan. Elsewhere, pick the nearest region, type your exact village or farm, or use GPS for an exact pin.",
    lr_tier1_t_intl: "Free or low local transport",
    lr_tier2_t_intl: "Medium-distance transport, charged per km each way",
    op_optional_intl: "Operator (driver) optional, extra hourly charge",
    tr_optional_intl: "Transport optional (charged per km, with a minimum)",
    au_method: "Sign-in method",
    au_m_email: "Email",
    au_m_phone: "Phone OTP",
    au_phone_hint: "Pakistani mobile, e.g. 0300 1234567. We text you a 6-digit code.",
    au_otp: "Code sent to {phone}",
    au_otp_err: "Enter the 6-digit code.",
    au_otp_send: "Send code",
    au_otp_verify: "Verify & continue",
    au_otp_resend: "Change number or resend code",
    au_otp_wrong: "That code is wrong or expired. Try again.",
    au_otp_limit: "Too many attempts. Wait a few minutes or use email.",
    au_phone_off: "Phone sign-in is not available right now (Firebase sends SMS only on the Blaze plan). Please use email.",
    role_buyer: "Crop Buyer",
    cloud_live: "Live: Firestore sync on",
    cloud_connecting: "Connecting to Firestore…",
    cloud_partial: "Partly synced: sign in to sync bookings",
    cloud_offline: "Offline: saved on this device",
    cloud_local: "Saved on this device only",
    cloud_nodb: "Firestore database not found",
    cloud_denied: "Firestore refused access: publish the rules",
    cloud_detail: "Firestore database \"{db}\":",
    au_reset_email_note: "We will email you a link to set a new password.",
    toast_reset_link: "Password reset link sent. Check your email (and spam folder).",
    loc_nearest_beyond: "Closest machines outside your radius (transport costs more):",
    loc_title: "Choose your location",
    loc_sub: "Anywhere in Pakistan: pick a province and district, type your village, drop a pin or use GPS.",
    loc_province: "Province / territory",
    loc_district: "District",
    loc_district_ph: "Search any district, e.g. Larkana, Swat, Turbat",
    loc_village: "Exact village / chak / tehsil",
    loc_village_ph: "e.g. Chak 45 GB, Tehsil Jaranwala",
    loc_gps: "Use my current GPS location",
    loc_gps_wait: "Finding your location…",
    loc_gps_denied: "Location permission was blocked. Drop a pin on the map instead.",
    loc_gps_unsupported: "This browser cannot share GPS. Drop a pin on the map instead.",
    loc_gps_outside: "Your GPS position is outside Pakistan. Drop a pin on the map instead.",
    loc_map_hint: "Tap the map to drop a pin. Tap a dot to pick a district.",
    loc_pin: "Pin set",
    loc_none: "No pin yet",
    loc_nearest: "Nearest district",
    loc_save: "Save location",
    loc_clear: "Clear",
    loc_change: "Change",
    loc_set: "Set location",
    loc_fit: "Show all Pakistan",
    loc_err: "Please set your location.",
    loc_your: "Your farm location",
    loc_road: "road est.",
    loc_far: "No machines within {km} km of {place} yet. Widen the radius or post a request.",
    loc_try_live: "Post a live request",
    loc_dist_note: "Distances are road estimates from your pin.",
    loc_dist_hint: "Set your location to see exact distance and transport cost.",
    loc_machine: "Where is the machine kept?",
    loc_farm: "Farm location",
    f_province: "Province",
    all_provinces: "All provinces",
    ad_provinces: "Active provinces",
    ad_provinces_sub: "Listings outside these provinces are hidden from the marketplace.",
    ad_min_one_prov: "Keep at least one province active.",
    vc_title: "Live voice call",
    vc_start: "Start voice call",
    vc_end: "End voice call",
    vc_ready: "Ready",
    vc_listening: "Listening… speak now",
    vc_thinking: "Processing…",
    vc_speaking: "Speaking…",
    vc_tap: "Tap the mic and speak",
    vc_tap_btn: "Tap to talk",
    vc_done_speaking: "Done speaking",
    vc_demo: "Example",
    vc_you_said: "You said",
    vc_mute: "Mute",
    vc_unmute: "Unmute",
    vc_mic_error: "The microphone could not start. Try again or play the example.",
    vc_unsupported: "Voice input isn't supported in this browser. Use Chrome or Edge on Android or a computer, or type your question.",
    vc_tts_off: "Voice replies are off. Replies still show as text.",
    vc_engine_claude: "Voice by Claude. Tap to talk each turn.",
    vc_engine_browser: "Browser voice. Hands-free: it listens again after each reply.",
    vc_lang_note: "Speech is heard and read in Urdu for this language.",
    nav_live: "Post a Request",
    cta_live: "Post a Request (Apni Boli)",
    lr_title: "Apni Boli: Name Your Price for Machinery",
    lr_sub: "Name your own price. Nearby owners see your request live on the radar and accept it or send a counter-offer. If no one nearby is free, expand the search tier by tier.",
    lr_machine: "Required machine",
    lr_village: "Your village / location",
    lr_hours: "Hours needed",
    lr_date: "Date",
    lr_rate: "Your offered rate (PKR/hr)",
    lr_rate_hint: "Typical asking rate nearby: {r}/hr",
    lr_rent: "Rent type",
    lr_dry: "Dry rent",
    lr_dry_d: "You provide diesel",
    lr_wet: "Wet rent",
    lr_wet_d: "Owner provides diesel at market rate",
    lr_diesel: "Diesel benchmark (PKR/L)",
    lr_diesel_note: "Market rate set by the Agri-Share team. Pakistan revises fuel prices frequently.",
    lr_peak: "Peak harvest season",
    lr_peak_d: "Village and pilot-zone machines are busy, so the search must fall back to Tier 3.",
    lr_post: "Post request & scan owners",
    lr_new: "New request",
    lr_radar: "Live radar",
    lr_compare: "Compare all 3 radius tiers",
    lr_idle: "Post a request to start scanning.",
    lr_scanning: "Scanning {tier}...",
    lr_offers_count: "live offers",
    lr_offers: "Live offers from owners",
    lr_idle_offers: "Offers from owners will appear here in real time.",
    lr_waiting: "Waiting for owners to respond...",
    lr_no_match: "No match found in {tier}.",
    lr_expand: "Expand search to {tier}",
    lr_raise: "Try raising your offer or changing the date.",
    lr_eta: "ETA",
    lr_accepts: "Accepts your rate",
    lr_counter: "Counter-offer",
    lr_grand: "Grand total",
    lr_free: "Free",
    lr_accept: "Accept",
    lr_decline: "Decline",
    lr_confirm: "Confirm booking",
    lr_confirmed: "Booked! Track it in My Bookings.",
    lr_compare_sub: "Same request, nearest owner in each tier. One click rescans that tier on the radar.",
    lr_nearest: "Nearest owner",
    lr_base: "Base machine rent",
    lr_test_tier: "Scan this tier",
    lr_compare_hint: "Post a request first, then use these buttons to compare each tier.",
    lr_legend_offer: "Offer received",
    lr_legend_scan: "Owner in range",
    lr_legend_busy: "Busy",
    lr_you: "You",
    lr_alert3: "Long-distance booking: transport and diesel add a lot. Check the full cost before you confirm.",
    lr_breakdown: "Cost transparency breakdown",
    lr_transport_local: "Local transport",
    lr_transport: "Transport ({km} km × 2 ways × PKR {rate}/km)",
    lr_fuel_wet: "Diesel (wet rent, billed by owner)",
    lr_platform_bill: "Paid through Agri-Share",
    lr_fuel_dry: "Your own diesel (dry rent, paid at pump)",
    lr_fuel_est: "Diesel use is estimated at {l} L per working hour at the current market price.",
    lr_tier1: "Tier 1: Village zone",
    lr_tier1_r: "1 to 5 km",
    lr_tier1_t: "Free or low local transport (PKR 0 to 500)",
    lr_tier2: "Tier 2: Pilot catchment",
    lr_tier2_r: "15 to 25 km",
    lr_tier2_t: "Medium-distance transport, PKR 60/km each way",
    lr_tier3: "Tier 3: Regional backup",
    lr_tier3_r: "up to 100 km",
    lr_tier3_t: "Emergency peak-harvest cover, long-distance transport",
    toast_lr_booked: "Booking confirmed with {owner}.",
    mb_via_live: "Booked via Apni Boli (Name Your Price)",
    ow_no_history: "No responses yet.",

    nav_market: "Marketplace", nav_bookings: "My Bookings", nav_owner: "Owner Portal", nav_agent: "Agri-Agent & USSD",
    tagline: "Sharing Resources, Growing Together",
    hero_kicker: "Punjab pilot · Tractors · Threshers · Harvesters",
    hero_title: "No need to buy heavy machinery. Rent it on demand.",
    hero_owner: "Your idle machinery can earn through rental.",
    hero_desc: "Find tractors, threshers and harvesters near your village, see the full dry-rent price before you book, and send a rental request in minutes.",
    cta_find: "Find machinery", cta_list: "List your machine",
    stat_pilot: "Punjab pilot clusters", stat_radius: "km in-app search", stat_comm: "platform commission", stat_cats: "machine categories",
    how_title: "How Agri-Share works",
    how1: "Owner lists idle machine", how2: "Renter searches within 15 km", how3: "Sees full dry-rent price", how4: "Owner confirms, rental happens",
    filters: "Filters", f_category: "Machine category", cat_all: "All", cat_tractor: "Tractors", cat_thresher: "Threshers", cat_harvester: "Harvesters",
    one_tractor: "Tractor", one_thresher: "Thresher", one_harvester: "Harvester",
    f_district: "Punjab district", all_districts: "All districts", f_radius: "Search radius", f_search: "Search machine or village",
    km: "km", radius_note: "Default 15 km in-app boundary, up to 25 km catchment",
    results: "{n} machines found", no_results: "No machines match these filters. Try widening the search radius or choosing all districts.", reset: "Reset filters",
    per_hour: "/hr", rate_label: "Hourly rate", distance: "away", dry_rent: "Dry rent: fuel/diesel excluded",
    op_included: "Operator (driver) included in rate", op_optional: "Operator (driver) optional: +PKR 500/hr", op_none: "No operator: bring your own driver",
    tr_included: "Transport included", tr_optional: "Transport optional (PKR 100/km, min 500)", tr_self: "Renter arranges transport",
    request: "Request Booking", unavailable: "Currently unavailable", owner: "Owner", new_badge: "New listing",
    bk_title: "Request booking", bk_date: "Rental date", bk_hours: "Working hours", bk_operator: "Add operator", bk_transport: "Add transport",
    bk_breakdown: "Transparent price breakdown", bk_base: "Base dry-rent", bk_op: "Operator", bk_tr: "Transport", bk_sub: "Subtotal",
    bk_comm: "Platform commission ({p})", bk_total: "Total estimated", bk_fuel_line: "Diesel/fuel: supplied by renter (not in price)",
    bk_ack: "I understand this is a dry rent: I will provide diesel/fuel, and overtime and late-return terms will be agreed with the owner before confirmation.",
    bk_pay: "Payment option", bk_pay_note: "Pay with EasyPaisa, JazzCash or cash through your Agri-Agent.",
    pay_easypaisa: "EasyPaisa", pay_jazzcash: "JazzCash", pay_agent: "Cash via local Agri-Agent",
    bk_name: "Your name", bk_phone: "Mobile number", bk_privacy: "Used only for this booking request (Section 12.2).",
    bk_submit: "Send booking request", cancel: "Cancel", close: "Close", included_word: "Included", not_added: "Not added",
    err_date: "Choose a rental date.", err_name: "Enter your name.", err_phone: "Enter a valid Pakistani mobile number (03XXXXXXXXX).", err_ack: "Please accept the dry-rent terms.",
    st_sent: "Request Sent", st_confirmed: "Owner Confirmed", st_completed: "Rental Completed", st_feedback: "Feedback Submitted", st_declined: "Declined by owner", st_cancelled: "Cancelled",
    mb_title: "My Bookings", mb_empty: "No bookings yet. Request a machine from the marketplace.", mb_complete: "Mark rental completed", mb_feedback: "Submit feedback",
    mb_cancel: "Cancel request", mb_waiting: "Waiting for the owner to confirm.", mb_go_owner: "Open Owner Portal",
    mb_rate: "Rate this rental", mb_comment: "Comments (optional)", mb_thanks: "Thank you. Your feedback was recorded.", mb_via_ussd: "Booked via USSD / Agri-Agent", mb_via_app: "Booked in app",
    ow_title: "Owner Portal", ow_sub: "Manage your machines, booking requests and earnings.",
    ow_list: "List Available Machinery", ow_requests: "Requests", ow_earn: "Earnings Estimator", ow_my: "Listed machinery",
    ow_name: "Machine name & model", ow_cat: "Category", ow_rate: "Hourly rate (PKR)", ow_village: "Village / area", ow_dist: "Distance from service area (km)",
    ow_opterm: "Operator terms", ow_trterm: "Transport terms", ow_ownername: "Owner name", ow_spec: "Key details (HP, attachments)",
    ow_fuel: "Fuel terms are fixed: dry rent, renter supplies diesel.", ow_submit: "Add to marketplace", ow_approve: "Approve", ow_decline: "Decline",
    ow_no_req: "No pending requests right now.", ow_pending: "Pending", ow_history: "Responded", ow_available: "Available", ow_hidden: "Hidden", ow_remove: "Remove",
    es_machine: "Machine", es_hours: "Idle hours available per day", es_days: "Rental days per season", es_util: "Expected booking rate",
    es_result: "Estimated seasonal rental income", es_month: "per season", es_confirmed: "From confirmed bookings so far",
    es_note: "The 6% commission (4% for smallholders) is added to the renter's bill, so the owner keeps the full rental. Fuel is excluded (dry rent).",
    ag_title: "Agri-Agent network", ag_sub: "Local village shopkeepers help farmers without smartphones find and book machinery.",
    ag1_t: "Who is an Agri-Agent?", ag1_d: "An existing village grocery or mobile-load shop, trained as a local booking point.",
    ag2_t: "What do they do?", ag2_d: "Explain the service, register farmers, show available machines and submit booking requests.",
    ag3_t: "How do they earn?", ag3_d: "A transparent commission per completed booking, under a published policy.",
    ag4_t: "Why it matters", ag4_d: "Builds trust face to face and covers farmers with low digital confidence or weak signal.",
    ussd_title: "USSD booking", ussd_demo: "USSD menu preview",
    ussd_steps: "Appendix C flow", ussd_hint: "Use the keypad or your keyboard. Press the green button to send.",
    kh_title: "Agri-Share Kisan Helper", kh_placeholder: "Ask about hours, costs or which machine...", kh_send: "Send",
    kh_hello: "Hello! I can estimate rental hours and dry-rent costs, help you pick a machine, and guide you through the website. Ask in English, Urdu or Roman Urdu.",
    kh_ai: "Claude AI", kh_offline: "Built-in helper", kh_thinking: "Thinking...",
    toast_booked: "Booking request sent to the owner.", toast_listed: "Submitted. It will appear in the marketplace once the Agri-Share team approves it.", toast_confirmed: "Booking confirmed.", toast_declined: "Booking declined.",
    toast_completed: "Rental marked as completed.", toast_feedback: "Feedback submitted.", toast_cancelled: "Booking request cancelled.", toast_removed: "Listing removed.",
    sindhi_note: "Sindhi is a planned expansion preview. The pilot runs in Punjabi and Urdu.",
    tr_fee: "Transport optional: +{fee} for {km} km",
    bk_offer_toggle: "Suggest your own price",
    bk_offer_sub: "Think the rate is high? Send the owner an offer. They can accept, counter or decline.",
    bk_offer_rate: "Your hourly rate offer (PKR)",
    bk_offer_tr: "Your transport offer (PKR)",
    bk_offer_note: "Message to owner (optional)",
    bk_offer_note_ph: "e.g. I live only 2 km away, can you reduce transport?",
    bk_offer_min: "Offer must be between {min} and {max}.",
    bk_listed: "Listed",
    bk_your_offer: "Your offer",
    bk_send_offer: "Send price offer",
    st_countered: "Owner Counter-Offer",
    offer_badge: "Price offer",
    mb_counter: "The owner sent a counter-offer:",
    mb_accept_counter: "Accept counter-offer",
    mb_decline_counter: "Decline",
    mb_offer_line: "Your offer: {rate}/hr",
    mb_signin: "Sign in to see your bookings.",
    ow_offer_from: "Renter's offer",
    ow_accept_offer: "Accept offer",
    ow_counter: "Counter",
    ow_send_counter: "Send counter-offer",
    ow_counter_rate: "Your hourly rate (PKR)",
    ow_counter_tr: "Transport (PKR)",
    ow_note: "Note",
    toast_offer: "Price offer sent to the owner.",
    toast_countered: "Counter-offer sent to the renter.",
    nav_members: "Members",
    auth_signin: "Sign in",
    auth_signup: "Sign up",
    auth_signout: "Sign out",
    au_title_in: "Welcome back",
    au_title_up: "Create your Agri-Share account",
    au_title_reset: "Reset password",
    au_sub: "Sign in to request bookings, send price offers and list machinery.",
    au_name: "Full name",
    au_email: "Email address",
    au_phone: "Mobile number",
    au_pass: "Password",
    au_pass2: "Confirm password",
    au_role: "I am a",
    role_renter: "Farmer / Renter",
    role_owner: "Machinery Owner",
    role_agent: "Agri-Agent",
    au_district: "District",
    au_consent: "I agree that Agri-Share stores my name, email, mobile and district only to run my account (Section 12.2).",
    au_create: "Create account",
    au_login: "Sign in",
    au_have: "Already have an account?",
    au_new: "New to Agri-Share?",
    au_forgot: "Forgot password?",
    au_reset_btn: "Set new password",
    au_reset_note: "You can reset the password of the account registered with this email.",
    au_back: "Back to sign in",
    au_err_name: "Enter your full name.",
    au_err_email: "Enter a valid email address.",
    au_err_pass: "Password must be at least 6 characters.",
    au_err_pass2: "Passwords do not match.",
    au_err_consent: "Please accept the privacy note.",
    au_err_wrong: "Email or password is incorrect.",
    au_err_none: "No account found. Please sign up first.",
    au_err_exists: "An account is already registered from this login. Please sign in.",
    au_err_taken: "This email is already registered. Please sign in.",
    au_err_generic: "Something went wrong. Please try again.",
    au_err_provider: "Email/Password sign-in is not enabled in Firebase. Turn it on in the Firebase console: Authentication > Sign-in method.",
    au_err_network: "Could not reach Firebase. Check the internet connection and try again.",
    au_err_admin_local: "Admin accounts must use a Firebase account. If you get \"wrong password\", use Sign up once to create it in Firebase.",
    ad403_local: "You are signed in as {email} with an account saved only in this browser, not a Firebase account. Admin access needs a Firebase account.",
    ad403_phone: "You are signed in with a phone number. Admin access needs the founder's email account.",
    ad403_other: "You are signed in as {email}, which is not an authorised admin email.",
    ad403_fix: "Sign out and sign in with Firebase",
    au_need: "Please sign in or create an account to continue.",
    au_local_note: "Saved in this browser only (shared records are not available here).",
    toast_welcome: "Welcome, {name}!",
    toast_signedout: "You have signed out.",
    toast_registered: "Account created. Welcome to Agri-Share!",
    toast_reset: "Password updated. Please sign in.",
    mem_title: "Registered members",
    mem_sub: "Everyone who signed up on Agri-Share, with their email and role.",
    mem_total: "Total members",
    mem_search: "Search name, email or district",
    mem_empty: "No one has registered yet.",
    mem_joined: "Joined",
    mem_last: "Last sign-in",
    mem_copy: "Copy as CSV",
    mem_copied: "Copied to clipboard",
    mem_cloud: "Live shared records. Only you (the owner) and editors can see this list.",
    mem_local: "Records are saved in this browser only.",
    mem_loading: "Loading members...",
    mem_slow: "Records are taking a while to load. They will appear once the connection answers.",
    nav_admin: "Admin Panel",
    ad_title: "Admin Panel",
    ad_sub: "Verify new machinery, watch bookings and commission, and set platform rates.",
    ad_lock_title: "Admin access",
    ad_lock_sub: "Enter the admin PIN to open the control panel.",
    ad_pin: "PIN",
    ad_unlock: "Unlock",
    ad_pin_wrong: "Wrong PIN. Try again.",
    ad_lock: "Lock",
    ad_verify: "Machinery verification",
    ad_ledger: "Bookings & commission",
    ad_settings: "Platform settings",
    ad_requests: "Apni Boli requests",
    ad_pending: "Pending verification",
    ad_approve: "Approve",
    ad_reject: "Reject",
    ad_none: "Nothing here yet.",
    ad_submitted: "submitted",
    ad_kpi_bookings: "Total bookings",
    ad_kpi_gtv: "Gross transaction value",
    ad_kpi_comm: "Commission earned",
    ad_kpi_pending: "Commission pending",
    ad_col_id: "Booking",
    ad_col_date: "Date",
    ad_col_machine: "Machine",
    ad_col_renter: "Renter",
    ad_col_channel: "Channel",
    ad_col_status: "Status",
    ad_col_value: "Value",
    ad_col_comm: "Commission",
    ad_diesel: "National diesel rate (PKR/L)",
    ad_diesel_sub: "Feeds the fuel estimator in Post a Request (all 3 tiers, including 100 km) and the farmer helper, across the whole app.",
    ad_save: "Save",
    ad_updated: "Last updated",
    ad_diesel_preview: "Example: harvester for 4 h uses about {l} L = {v} of diesel.",
    ad_districts: "Pilot districts",
    ad_districts_sub: "Machines in switched-off districts are hidden from renters and new listings.",
    ad_min_one: "Keep at least one district switched on.",
    ad_reset: "Reset marketplace data",
    ad_reset_sub: "Removes sample machines, clears bookings, requests and crop posts, and resets the diesel rate.",
    ad_reset_confirm: "Tap again to confirm",
    ad_req_rate: "Offer",
    ad_req_tier: "Tier reached",
    rq_open: "Open",
    rq_booked: "Booked",
    rq_closed: "Closed",
    ls_pending: "Pending verification",
    ls_approved: "Approved",
    ls_rejected: "Rejected",
    toast_approved: "Listing approved. It is now live in the marketplace.",
    toast_rejected: "Listing rejected.",
    toast_diesel: "Diesel rate updated to {v}/L across the app.",
    toast_demo_reset: "Marketplace data reset.",
    lr_diesel_admin: "National diesel benchmark: {v}/L",
    lr_recent: "Your recent requests",
    bk_smallholder: "Smallholder farmer (under 5 acres)",
    bk_smallholder_sub: "Subsidised 4% commission instead of the standard 6%.",
    pay_paylater: "Harvest Now, Pay Later (30% now + 70% after harvest)",
    pl_now: "Pay now (30%)",
    pl_later: "After harvest (70%)",
    pl_partner: "Credit partner (proposed)",
    pl_due: "Repay 70% after",
    pl_days: "days",
    pl_due_on: "Due by",
    pl_now_short: "now",
    pl_risk: "The 70% is lent by the third-party microfinance partner, who carries the repayment risk. Agri-Share carries no credit risk. Partner names are proposed only (no agreement exists) and partner fees may apply.",
    pl_settled: "Settled",
    pl_pending: "70% due",
    pl_settled_by: "Repaid automatically from Agri-Market sale {id}.",
    pl_settle_mandi: "Settle by selling your harvest on Agri-Market",
    kp_title: "No smartphone? Book via keypad phone",
    kp_sub: "Call the toll-free helpline or dial the USSD code from any basic phone. A Punjabi or Urdu voice guides you step by step, and your booking is confirmed by SMS.",
    kp_toll: "Toll-free helpline",
    kp_ussd: "USSD code",
    kp_demo: "Toll-free from any mobile network.",
    kp_ivr: "Hear the IVR voice steps",
    kp_try: "Try keypad booking",
    nav_mandi: "Agri-Market",
    am_title: "Agri-Market: Sell Your Harvest",
    am_sub: "Post your crop and your price. Registered flour mills, rice mills and bulk buyers bid live on it. Pick the best offer.",
    am_credit: "Your pending machinery credit (70%)",
    am_credit_n: "bookings on Harvest Now, Pay Later",
    am_closed_loop: "Closed-Loop Settlement",
    am_closed_title: "Your crop sale pays off your machinery credit automatically",
    am_loop1: "Rent machinery with only 30% upfront",
    am_loop2: "Harvest your crop",
    am_loop3: "Sell it on Agri-Market to a verified buyer",
    am_loop4: "The pending 70% is repaid to the partner and your net profit goes to your JazzCash or EasyPaisa",
    am_crop: "Crop",
    crop_wheat: "Wheat",
    crop_rice: "Rice",
    crop_maize: "Maize",
    crop_cotton: "Cotton",
    am_qty: "Quantity (maunds, 40 kg each)",
    am_grade: "Quality",
    am_grade_a: "Grade A (clean, dry)",
    am_grade_b: "Grade B",
    am_rate: "Your expected rate (PKR per maund)",
    am_bench_src: "Market guide: about {r} per maund (from recent Punjab market reports).",
    am_bench_est: "Market guide: about {r} per maund.",
    am_expected_total: "Expected total",
    am_wallet: "Receive payment in",
    am_wallet_no: "Wallet mobile number",
    am_post: "Post crop & get buyer bids",
    am_new: "New sale post",
    am_recent: "Your recent crop posts",
    am_mann: "maund",
    am_st_open: "Open",
    am_st_sold: "Sold",
    am_st_closed: "Closed",
    am_bids: "Live bids from buyers",
    am_waiting: "Buyers are bidding...",
    am_bids_n: "bids",
    am_idle: "Post your crop to receive bids from mills and bulk buyers.",
    am_no_bids: "No buyer matched your rate. Try a slightly lower price or a new post.",
    am_type_flour: "Flour mill",
    am_type_rice: "Rice mill",
    am_type_feed: "Feed / starch mill",
    am_type_ginning: "Ginning factory",
    am_type_bulk: "Bulk buyer",
    am_sample: "sample buyer",
    am_above: "Bids above your rate",
    am_pickup: "buyer collects from farm",
    am_settlement: "Settlement preview",
    am_gross: "Crop sale value",
    am_minus_credit: "Machinery credit repaid (70%)",
    am_unsettled: "{v} of credit stays open because this sale does not fully cover it.",
    am_net: "Net profit to you",
    am_to_wallet: "Payout to your {w} {n} once the buyer pays.",
    am_confirm: "Confirm sale",
    am_done: "Sale confirmed and settled.",
    am_sold_to: "Sold to",
    am_demo_note: "Agri-Share keeps a record of every settlement.",
    toast_sold: "Sale confirmed. {net} net profit to your wallet.",
    ad_kpi_credit: "Harvest credit outstanding (partner-funded)",
    hero_local: "Machine kharidna zaroori nahi, kiraye par lein.",
    kh_short: "Kisan Helper",
    kp_ivr_pa: "Punjabi IVR",
    kp_ivr_ur: "Urdu IVR",
    ab_name: "Apni Boli (Name Your Price)",
    ab_tag: "Enter your rate, nearby owners send offers",
    vc_no_speech: "No speech detected — tap the mic to try again.",
    vc_again: "Tap to Speak Again",
    vc_replay: "Listen"
  },
  ur: {
    vc_mic_blocked: "مائیک کی اجازت نہیں ملی۔ براؤزر کی سیٹنگز میں مائیک کی اجازت دیں، پھر دوبارہ بولنے کے لیے دبائیں۔",
    vc_demo_btn: "مثال سنیں",
    vc_retry: "مائیک دوبارہ آزمائیں",
    vc_no_mic: "مائیک نہیں ملا۔ مائیک لگائیں، پھر دوبارہ بولنے کے لیے دبائیں۔",
    vc_net: "آواز پہچاننے کے لیے انٹرنیٹ چاہیے۔ کنکشن چیک کریں، پھر دوبارہ بولنے کے لیے دبائیں۔",
    vc_lang_unsupported: "یہ براؤزر اس زبان میں نہیں سن سکتا۔ کروم استعمال کریں یا 'مثال سنیں' دبائیں۔",
    vc_no_voice: "اس ڈیوائس پر اردو آواز انسٹال نہیں، اس لیے جواب رومن اردو میں پڑھے جا رہے ہیں۔ اردو سننے کے لیے اردو آواز انسٹال کریں (اینڈرائیڈ: سیٹنگز > ٹیکسٹ ٹو اسپیچ)۔",
    nav_activity: "سرگرمی",
    nav_s_market: "مارکیٹ",
    nav_s_live: "درخواست",
    nav_s_mandi: "فصل بیچیں",
    nav_s_bookings: "بکنگ",
    nav_s_owner: "مالک",
    nav_s_agent: "ایجنٹ",
    nav_s_more: "مزید",
    hero_role_farmer: "کسان",
    hero_need: "مشین چاہیے؟",
    hero_role_owner: "مالک",
    hero_earn: "اپنی مشین سے کمائیں",
    hero_live: "ایگری شیئر پر لائیو",
    hero_machines: "اس خطے میں درج مشینیں",
    hero_owners: "مالکان",
    hero_bookings: "اس ڈیوائس پر بکنگز",
    tr1_t: "تصدیق شدہ مالکان",
    tr1_s: "ہر لسٹنگ لائیو ہونے سے پہلے ایگری شیئر ٹیم جانچتی ہے",
    tr2_t: "4% سے 6% منصفانہ کمیشن",
    tr2_s: "5 ایکڑ سے کم والے کسانوں کے لیے صرف 4%",
    tr3_t: "30/70 فصل کریڈٹ",
    tr3_s: "ابھی 30%، فصل کے بعد 70% (مجوزہ پارٹنرز)",
    tr4_t: "24/7 ہیلپ لائن اور آواز",
    tr4_s: "ٹول فری یو اے این اور کسان ہیلپر وائس اسسٹنٹ",
    ov_dry: "ڈرائی رینٹ",
    ov_op: "آپریٹر شامل",
    toast_broadcast_t: "درخواست بھیج دی گئی",
    toast_broadcast: "{n} قریبی مالکان کو بھیجی گئی۔ کوئی قبول نہ کرے تو دائرہ خود بڑھے گا۔",
    toast_broadcast0: "قریبی مالکان تلاش ہو رہے ہیں۔ دائرہ خود بڑھے گا۔",
    toast_booked_t: "بکنگ ہو گئی",
    toast_offer_t: "پیشکش بھیج دی",
    toast_synced: "کلاؤڈ پر محفوظ۔",
    toast_local: "اس ڈیوائس پر محفوظ۔",
    act_title: "میری سرگرمی",
    act_sub: "بکنگ، لائیو درخواستیں اور ایگری مارکیٹ سودے ایک جگہ",
    act_bookings: "بکنگ",
    act_requests: "درخواستیں",
    act_deals: "سودے",
    act_voucher: "واؤچر",
    act_view_voucher: "واؤچر دیکھیں",
    act_empty_b: "ابھی کوئی بکنگ نہیں۔",
    act_empty_r: "ابھی کوئی لائیو درخواست نہیں۔",
    act_empty_d: "ابھی کوئی فصل پوسٹ نہیں۔",
    act_all: "مکمل بکنگ صفحہ کھولیں",
    act_sold: "فروخت",
    act_open: "کھلی",
    vo_title: "ڈیجیٹل بکنگ واؤچر",
    vo_ref: "حوالہ",
    vo_issued: "جاری",
    vo_verified: "بکنگ ایگری شیئر پر درج ہے",
    vo_cancelled: "یہ بکنگ منسوخ یا مسترد ہو گئی",
    vo_track: "لائیو اسٹیٹس",
    vo_s1: "مالک نے تصدیق کی",
    vo_s2: "مشین راستے میں",
    vo_s3: "کام مکمل",
    vo_waiting: "مالک کی تصدیق کا انتظار ہے۔",
    vo_mark_route: "مالک: مشین راستے میں ہے",
    vo_machine: "مشین",
    vo_date: "تاریخ اور گھنٹے",
    vo_location: "ضلع",
    vo_renter: "کسان",
    vo_items: "خرچ کی تفصیل",
    vo_total: "کل رقم",
    vo_fuel: "ڈیزل کا اندازہ",
    vo_print: "پرنٹ / PDF",
    vo_download: "ڈاؤن لوڈ",
    vo_close: "بند کریں",
    vo_note: "یہ بکنگ آئی ڈی مالک یا اپنے ایگری ایجنٹ کو دکھائیں۔",
    vo_pattern_note: "مشین دیتے وقت یہ بیج اور بکنگ نمبر مالک کو دکھائیں۔",
    lr_diesel_note_intl: "اس علاقے میں ڈیزل کی عام قیمت۔ ڈرائی رینٹ میں ڈیزل کسان خود خریدتا ہے۔",
    country: "ملک / خطہ",
    country_PK: "پاکستان",
    country_CN: "چین",
    country_IN: "بھارت",
    country_US: "امریکہ / یورپ",
    country_ME: "مشرق وسطیٰ / افریقہ",
    fx_note: "قیمتیں مقامی کرنسی میں حوالہ ریٹ پر (1 ڈالر ≈ 278 روپے ≈ 6.67 یوآن ≈ 94 بھارتی روپے)۔ علاقائی ریٹ مارکیٹ اندازے ہیں۔",
    one_leveler: "لیزر لینڈ لیولر",
    one_planter: "سیڈ ڈرل / پلانٹر",
    one_drone: "اسپرے ڈرون",
    one_implement: "آلات / پمپ",
    cat_leveler: "لیولر",
    cat_planter: "پلانٹر",
    cat_drone: "ڈرون",
    cat_implement: "آلات",
    lr_steps: "درخواست کے مراحل",
    lr_step1: "مشین کی قسم",
    lr_step2: "مقام اور پیشکش",
    lr_step3: "لائیو آفرز",
    lr_choose: "آپ کو کون سی مشین چاہیے؟",
    lr_choose_sub: "پہلے مشین کی قسم چنیں، پھر اپنا ریٹ بتائیں۔ {country} کے ماڈل اور ریٹ۔",
    cat_rates_note: "عام مارکیٹ ریٹ، حتمی قیمت نہیں۔",
    lr_est_rate: "اندازاً فی گھنٹہ ریٹ",
    lr_select: "منتخب کریں اور آگے بڑھیں",
    lr_selected: "منتخب",
    lr_change_machine: "بدلیں",
    lr_pref_model: "پسندیدہ ماڈل (اختیاری)",
    lr_any_model: "کوئی بھی ماڈل",
    lr_diesel_intl: "مقامی ڈیزل قیمت: {v}/لیٹر",
    lr_fuel_battery: "بیٹری سے چلتا ہے: ڈیزل کی ضرورت نہیں۔",
    ow_suggest: "{country} کے تجویز کردہ ماڈل (نام، تفصیل اور ریٹ بھرنے کے لیے دبائیں)",
    loc_sub_intl: "علاقہ چنیں، گاؤں یا فارم لکھیں، یا GPS استعمال کریں۔",
    loc_regions: "زرعی علاقے",
    loc_map_pk_only: "انٹرایکٹو نقشہ صرف پاکستان کا ہے۔ دوسرے ممالک میں قریبی علاقہ چنیں، گاؤں لکھیں یا درست پن کے لیے GPS استعمال کریں۔",
    lr_tier1_t_intl: "مفت یا کم مقامی ٹرانسپورٹ",
    lr_tier2_t_intl: "درمیانی ٹرانسپورٹ، فی کلومیٹر ہر طرف",
    op_optional_intl: "آپریٹر (ڈرائیور) اختیاری، اضافی فی گھنٹہ خرچ",
    tr_optional_intl: "ٹرانسپورٹ اختیاری (فی کلومیٹر، کم از کم خرچ کے ساتھ)",
    au_method: "سائن ان کا طریقہ",
    au_m_email: "ای میل",
    au_m_phone: "فون OTP",
    au_phone_hint: "پاکستانی موبائل، مثلاً 0300 1234567۔ آپ کو 6 ہندسوں کا کوڈ بھیجا جائے گا۔",
    au_otp: "کوڈ {phone} پر بھیجا گیا",
    au_otp_err: "6 ہندسوں کا کوڈ لکھیں۔",
    au_otp_send: "کوڈ بھیجیں",
    au_otp_verify: "تصدیق کریں اور آگے بڑھیں",
    au_otp_resend: "نمبر بدلیں یا دوبارہ کوڈ بھیجیں",
    au_otp_wrong: "کوڈ غلط ہے یا ختم ہو گیا۔ دوبارہ کوشش کریں۔",
    au_otp_limit: "بہت زیادہ کوششیں۔ چند منٹ انتظار کریں یا ای میل استعمال کریں۔",
    au_phone_off: "فون سائن ان ابھی دستیاب نہیں (Firebase صرف Blaze پلان پر SMS بھیجتا ہے)۔ ای میل استعمال کریں۔",
    role_buyer: "فصل خریدار",
    cloud_live: "لائیو: Firestore سنک آن",
    cloud_connecting: "Firestore سے رابطہ ہو رہا ہے…",
    cloud_partial: "جزوی سنک: بکنگ سنک کرنے کے لیے سائن ان کریں",
    cloud_offline: "آف لائن: اس ڈیوائس پر محفوظ",
    cloud_local: "صرف اس ڈیوائس پر محفوظ",
    au_reset_email_note: "نیا پاس ورڈ رکھنے کا لنک آپ کی ای میل پر بھیجا جائے گا۔",
    toast_reset_link: "پاس ورڈ ری سیٹ لنک بھیج دیا گیا۔ اپنی ای میل (اور اسپام) دیکھیں۔",
    loc_nearest_beyond: "آپ کے دائرے سے باہر قریب ترین مشینیں (ٹرانسپورٹ مہنگی):",
    loc_title: "اپنا مقام منتخب کریں",
    loc_sub: "پاکستان میں کہیں بھی: صوبہ اور ضلع چنیں، گاؤں لکھیں، نقشے پر پن لگائیں یا GPS استعمال کریں۔",
    loc_province: "صوبہ / علاقہ",
    loc_district: "ضلع",
    loc_district_ph: "کوئی بھی ضلع تلاش کریں، مثلاً لاڑکانہ، سوات، تربت",
    loc_village: "گاؤں / چک / تحصیل",
    loc_village_ph: "مثلاً چک 45 گ ب، تحصیل جڑانوالہ",
    loc_gps: "میرا موجودہ GPS مقام استعمال کریں",
    loc_gps_wait: "آپ کا مقام تلاش ہو رہا ہے…",
    loc_gps_denied: "مقام کی اجازت بند ہے۔ نقشے پر پن لگائیں۔",
    loc_gps_unsupported: "یہ براؤزر GPS نہیں دے سکتا۔ نقشے پر پن لگائیں۔",
    loc_gps_outside: "آپ کا GPS مقام پاکستان سے باہر ہے۔ نقشے پر پن لگائیں۔",
    loc_map_hint: "پن لگانے کے لیے نقشے پر ٹیپ کریں۔ ضلع چننے کے لیے نقطے پر ٹیپ کریں۔",
    loc_pin: "پن لگ گیا",
    loc_none: "ابھی پن نہیں",
    loc_nearest: "قریبی ضلع",
    loc_save: "مقام محفوظ کریں",
    loc_clear: "صاف کریں",
    loc_change: "تبدیل کریں",
    loc_set: "مقام لگائیں",
    loc_fit: "پورا پاکستان دکھائیں",
    loc_err: "براہ کرم اپنا مقام لگائیں۔",
    loc_your: "آپ کے کھیت کا مقام",
    loc_road: "سڑک کا اندازہ",
    loc_far: "{place} کے {km} کلومیٹر کے اندر ابھی کوئی مشین نہیں۔ دائرہ بڑھائیں یا درخواست پوسٹ کریں۔",
    loc_try_live: "لائیو درخواست بھیجیں",
    loc_dist_note: "فاصلے آپ کے پن سے سڑک کا اندازہ ہیں۔",
    loc_dist_hint: "درست فاصلہ اور ٹرانسپورٹ خرچ دیکھنے کے لیے اپنا مقام لگائیں۔",
    loc_machine: "مشین کہاں رکھی ہے؟",
    loc_farm: "کھیت کا مقام",
    f_province: "صوبہ",
    all_provinces: "تمام صوبے",
    ad_provinces: "فعال صوبے",
    ad_provinces_sub: "ان صوبوں سے باہر کی لسٹنگ مارکیٹ میں نہیں دکھائی جاتی۔",
    ad_min_one_prov: "کم از کم ایک صوبہ فعال رکھیں۔",
    vc_title: "لائیو وائس کال",
    vc_start: "وائس کال شروع کریں",
    vc_end: "وائس کال ختم کریں",
    vc_ready: "تیار",
    vc_listening: "سن رہا ہوں… بولیں",
    vc_thinking: "سمجھ رہا ہوں…",
    vc_speaking: "بول رہا ہوں…",
    vc_tap: "مائیک دبائیں اور بولیں",
    vc_tap_btn: "بولنے کے لیے دبائیں",
    vc_done_speaking: "بات مکمل",
    vc_demo: "مثال",
    vc_you_said: "آپ نے کہا",
    vc_mute: "آواز بند",
    vc_unmute: "آواز کھولیں",
    vc_mic_error: "مائیک شروع نہیں ہو سکا۔ دوبارہ کوشش کریں یا مثال چلائیں۔",
    vc_unsupported: "اس براؤزر میں آواز سے بات ممکن نہیں۔ اینڈرائیڈ یا کمپیوٹر پر کروم یا ایج استعمال کریں، یا سوال لکھ دیں۔",
    vc_tts_off: "آواز میں جواب بند ہیں۔ جواب متن میں نظر آئیں گے۔",
    vc_engine_claude: "Claude کی آواز۔ ہر بار بولنے کے لیے دبائیں۔",
    vc_engine_browser: "براؤزر کی آواز۔ ہر جواب کے بعد خود دوبارہ سنتا ہے۔",
    vc_lang_note: "اس زبان کے لیے آواز اردو میں سنی اور پڑھی جاتی ہے۔",
    nav_live: "درخواست پوسٹ کریں",
    cta_live: "درخواست پوسٹ کریں (اپنی بولی)",
    lr_title: "اپنی بولی: مشینری کے لیے اپنا ریٹ طے کریں",
    lr_sub: "اپنی قیمت خود بتائیں۔ قریبی مالکان ریڈار پر آپ کی درخواست دیکھ کر قبول کرتے ہیں یا جوابی پیشکش بھیجتے ہیں۔ قریب کوئی فارغ نہ ہو تو دائرہ مرحلہ وار بڑھائیں۔",
    lr_machine: "مطلوبہ مشین",
    lr_village: "آپ کا گاؤں / مقام",
    lr_hours: "درکار گھنٹے",
    lr_date: "تاریخ",
    lr_rate: "آپ کی پیشکش (روپے فی گھنٹہ)",
    lr_rate_hint: "قریب کا عام ریٹ: {r} فی گھنٹہ",
    lr_rent: "کرائے کی قسم",
    lr_dry: "ڈرائی رینٹ",
    lr_dry_d: "ڈیزل آپ کا",
    lr_wet: "ویٹ رینٹ",
    lr_wet_d: "ڈیزل مالک کا، مارکیٹ ریٹ پر",
    lr_diesel: "ڈیزل ریٹ (روپے فی لیٹر)",
    lr_diesel_note: "ایگری شیئر ٹیم کا مقرر کردہ مارکیٹ ریٹ۔ پاکستان میں ڈیزل کی قیمت اکثر بدلتی ہے۔",
    lr_peak: "کٹائی کا مصروف موسم",
    lr_peak_d: "گاؤں اور پائلٹ علاقے کی مشینیں مصروف ہیں، اس لیے تلاش تیسرے درجے تک جائے گی۔",
    lr_post: "درخواست پوسٹ کریں اور مالکان تلاش کریں",
    lr_new: "نئی درخواست",
    lr_radar: "لائیو ریڈار",
    lr_compare: "تینوں دائروں کا موازنہ",
    lr_idle: "تلاش شروع کرنے کے لیے درخواست پوسٹ کریں۔",
    lr_scanning: "{tier} میں تلاش جاری...",
    lr_offers_count: "لائیو پیشکشیں",
    lr_offers: "مالکان کی لائیو پیشکشیں",
    lr_idle_offers: "مالکان کی پیشکشیں یہاں فوراً نظر آئیں گی۔",
    lr_waiting: "مالکان کے جواب کا انتظار...",
    lr_no_match: "{tier} میں کوئی مشین نہیں ملی۔",
    lr_expand: "تلاش {tier} تک بڑھائیں",
    lr_raise: "پیشکش بڑھائیں یا تاریخ بدلیں۔",
    lr_eta: "پہنچنے کا وقت",
    lr_accepts: "آپ کا ریٹ منظور",
    lr_counter: "جوابی پیشکش",
    lr_grand: "کل رقم",
    lr_free: "مفت",
    lr_accept: "قبول",
    lr_decline: "انکار",
    lr_confirm: "بکنگ کنفرم کریں",
    lr_confirmed: "بکنگ ہو گئی! میری بکنگز میں دیکھیں۔",
    lr_compare_sub: "ایک ہی درخواست، ہر درجے کا قریب ترین مالک۔ ایک کلک سے وہ درجہ ریڈار پر دوبارہ اسکین ہوگا۔",
    lr_nearest: "قریب ترین مالک",
    lr_base: "مشین کا بنیادی کرایہ",
    lr_test_tier: "یہ درجہ اسکین کریں",
    lr_compare_hint: "پہلے درخواست پوسٹ کریں، پھر ان بٹنوں سے ہر دائرے کا موازنہ کریں۔",
    lr_legend_offer: "پیشکش آئی",
    lr_legend_scan: "دائرے میں مالک",
    lr_legend_busy: "مصروف",
    lr_you: "آپ",
    lr_alert3: "دور کی بکنگ: ٹرانسپورٹ اور ڈیزل کا خرچ زیادہ ہے۔ کنفرم سے پہلے مکمل خرچ دیکھ لیں۔",
    lr_breakdown: "خرچ کی مکمل تفصیل",
    lr_transport_local: "مقامی ٹرانسپورٹ",
    lr_transport: "ٹرانسپورٹ ({km} کلومیٹر × 2 طرف × {rate} روپے)",
    lr_fuel_wet: "ڈیزل (ویٹ رینٹ، مالک کا بل)",
    lr_platform_bill: "ایگری شیئر کے ذریعے ادائیگی",
    lr_fuel_dry: "آپ کا اپنا ڈیزل (ڈرائی رینٹ، پمپ پر)",
    lr_fuel_est: "ڈیزل کا اندازہ: فی گھنٹہ {l} لیٹر، موجودہ مارکیٹ قیمت پر۔",
    lr_tier1: "درجہ 1: گاؤں کا علاقہ",
    lr_tier1_r: "1 سے 5 کلومیٹر",
    lr_tier1_t: "مفت یا کم مقامی ٹرانسپورٹ (0 سے 500 روپے)",
    lr_tier2: "درجہ 2: پائلٹ علاقہ",
    lr_tier2_r: "15 سے 25 کلومیٹر",
    lr_tier2_t: "درمیانی ٹرانسپورٹ، 60 روپے فی کلومیٹر ہر طرف",
    lr_tier3: "درجہ 3: علاقائی بیک اپ",
    lr_tier3_r: "100 کلومیٹر تک",
    lr_tier3_t: "کٹائی کے رش میں ہنگامی سہولت، لمبی ٹرانسپورٹ",
    toast_lr_booked: "{owner} کے ساتھ بکنگ کنفرم۔",
    mb_via_live: "اپنی بولی سے بکنگ",
    ow_no_history: "ابھی کوئی جواب نہیں۔",
    nav_market: "مشینری مارکیٹ", nav_bookings: "میری بکنگز", nav_owner: "مالک پورٹل", nav_agent: "ایگری ایجنٹ اور USSD",
    tagline: "وسائل بانٹیں، مل کر بڑھیں",
    hero_kicker: "پنجاب پائلٹ · ٹریکٹر · تھریشر · ہارویسٹر",
    hero_title: "مشین خریدنا ضروری نہیں، کرائے پر لیں۔",
    hero_owner: "آپ کی فارغ مشینری کرائے سے کما سکتی ہے۔",
    hero_desc: "اپنے گاؤں کے قریب ٹریکٹر، تھریشر اور ہارویسٹر تلاش کریں، بکنگ سے پہلے مکمل ڈرائی رینٹ قیمت دیکھیں اور چند منٹ میں درخواست بھیجیں۔",
    cta_find: "مشینری تلاش کریں", cta_list: "اپنی مشین درج کریں",
    stat_pilot: "پنجاب پائلٹ علاقے", stat_radius: "کلومیٹر ایپ تلاش", stat_comm: "پلیٹ فارم کمیشن", stat_cats: "مشینوں کی اقسام",
    how_title: "ایگری شیئر کیسے کام کرتا ہے",
    how1: "مالک فارغ مشین درج کرتا ہے", how2: "کسان 15 کلومیٹر میں تلاش کرتا ہے", how3: "مکمل ڈرائی رینٹ قیمت دیکھتا ہے", how4: "مالک تصدیق کرتا ہے، کام ہوتا ہے",
    filters: "فلٹر", f_category: "مشین کی قسم", cat_all: "سب", cat_tractor: "ٹریکٹر", cat_thresher: "تھریشر", cat_harvester: "ہارویسٹر",
    one_tractor: "ٹریکٹر", one_thresher: "تھریشر", one_harvester: "ہارویسٹر",
    f_district: "پنجاب کا ضلع", all_districts: "تمام اضلاع", f_radius: "تلاش کا دائرہ", f_search: "مشین یا گاؤں تلاش کریں",
    km: "کلومیٹر", radius_note: "ڈیفالٹ 15 کلومیٹر، زیادہ سے زیادہ 25 کلومیٹر",
    results: "{n} مشینیں ملیں", no_results: "ان فلٹرز سے کوئی مشین نہیں ملی۔ تلاش کا دائرہ بڑھائیں یا تمام اضلاع چنیں۔", reset: "فلٹر ری سیٹ کریں",
    per_hour: "/گھنٹہ", rate_label: "فی گھنٹہ ریٹ", distance: "دور", dry_rent: "ڈرائی رینٹ: ڈیزل شامل نہیں",
    op_included: "آپریٹر (ڈرائیور) کرائے میں شامل", op_optional: "آپریٹر (ڈرائیور) اختیاری: +500 روپے/گھنٹہ", op_none: "آپریٹر نہیں: اپنا ڈرائیور لائیں",
    tr_included: "ٹرانسپورٹ شامل", tr_optional: "ٹرانسپورٹ اختیاری (100 روپے فی کلومیٹر، کم از کم 500)", tr_self: "ٹرانسپورٹ کسان کی ذمہ داری",
    request: "بکنگ کی درخواست", unavailable: "فی الحال دستیاب نہیں", owner: "مالک", new_badge: "نئی فہرست",
    bk_title: "بکنگ کی درخواست", bk_date: "کرائے کی تاریخ", bk_hours: "کام کے گھنٹے", bk_operator: "آپریٹر شامل کریں", bk_transport: "ٹرانسپورٹ شامل کریں",
    bk_breakdown: "قیمت کی واضح تفصیل", bk_base: "بنیادی ڈرائی رینٹ", bk_op: "آپریٹر", bk_tr: "ٹرانسپورٹ", bk_sub: "ذیلی کل",
    bk_comm: "پلیٹ فارم کمیشن ({p})", bk_total: "کل تخمینی رقم", bk_fuel_line: "ڈیزل: کسان فراہم کرے گا (قیمت میں شامل نہیں)",
    bk_ack: "میں سمجھتا/سمجھتی ہوں کہ یہ ڈرائی رینٹ ہے: ڈیزل میں فراہم کروں گا/گی، اور اوور ٹائم اور دیر سے واپسی کی شرائط تصدیق سے پہلے مالک کے ساتھ طے ہوں گی۔",
    bk_pay: "ادائیگی کا طریقہ", bk_pay_note: "ایزی پیسہ، جاز کیش یا اپنے ایگری ایجنٹ کے ذریعے نقد ادائیگی کریں۔",
    pay_easypaisa: "ایزی پیسہ", pay_jazzcash: "جاز کیش", pay_agent: "مقامی ایگری ایجنٹ کے ذریعے نقد",
    bk_name: "آپ کا نام", bk_phone: "موبائل نمبر", bk_privacy: "صرف اسی بکنگ کے لیے استعمال ہوگا (سیکشن 12.2)۔",
    bk_submit: "بکنگ کی درخواست بھیجیں", cancel: "منسوخ", close: "بند کریں", included_word: "شامل", not_added: "شامل نہیں",
    err_date: "کرائے کی تاریخ چنیں۔", err_name: "اپنا نام لکھیں۔", err_phone: "درست موبائل نمبر لکھیں (03XXXXXXXXX)۔", err_ack: "براہ کرم ڈرائی رینٹ کی شرائط قبول کریں۔",
    st_sent: "درخواست بھیجی گئی", st_confirmed: "مالک نے تصدیق کی", st_completed: "کرایہ مکمل", st_feedback: "رائے جمع ہو گئی", st_declined: "مالک نے انکار کیا", st_cancelled: "منسوخ",
    mb_title: "میری بکنگز", mb_empty: "ابھی کوئی بکنگ نہیں۔ مارکیٹ سے مشین کی درخواست کریں۔", mb_complete: "کرایہ مکمل کریں", mb_feedback: "رائے جمع کریں",
    mb_cancel: "درخواست منسوخ کریں", mb_waiting: "مالک کی تصدیق کا انتظار ہے۔", mb_go_owner: "مالک پورٹل کھولیں",
    mb_rate: "اس کرائے کی درجہ بندی کریں", mb_comment: "تبصرہ (اختیاری)", mb_thanks: "شکریہ۔ آپ کی رائے محفوظ ہو گئی۔", mb_via_ussd: "USSD / ایگری ایجنٹ سے بکنگ", mb_via_app: "ایپ سے بکنگ",
    ow_title: "مالک پورٹل", ow_sub: "اپنی مشینیں، بکنگ درخواستیں اور کمائی سنبھالیں۔",
    ow_list: "دستیاب مشینری درج کریں", ow_requests: "درخواستیں", ow_earn: "آمدنی کا تخمینہ", ow_my: "درج شدہ مشینری",
    ow_name: "مشین کا نام اور ماڈل", ow_cat: "قسم", ow_rate: "فی گھنٹہ کرایہ (روپے)", ow_village: "گاؤں / علاقہ", ow_dist: "سروس ایریا سے فاصلہ (کلومیٹر)",
    ow_opterm: "آپریٹر کی شرائط", ow_trterm: "ٹرانسپورٹ کی شرائط", ow_ownername: "مالک کا نام", ow_spec: "اہم تفصیل (ہارس پاور، آلات)",
    ow_fuel: "ایندھن کی شرط مقرر ہے: ڈرائی رینٹ، ڈیزل کسان کا۔", ow_submit: "مارکیٹ میں شامل کریں", ow_approve: "منظور", ow_decline: "انکار",
    ow_no_req: "ابھی کوئی زیر التوا درخواست نہیں۔", ow_pending: "زیر التوا", ow_history: "جواب دیا گیا", ow_available: "دستیاب", ow_hidden: "پوشیدہ", ow_remove: "ہٹائیں",
    es_machine: "مشین", es_hours: "روزانہ فارغ گھنٹے", es_days: "سیزن میں کرائے کے دن", es_util: "متوقع بکنگ کی شرح",
    es_result: "سیزن کی تخمینی کرایہ آمدنی", es_month: "فی سیزن", es_confirmed: "اب تک کی تصدیق شدہ بکنگز سے",
    es_note: "6٪ کمیشن (چھوٹے کسانوں کے لیے 4٪) کسان کے بل میں شامل ہوتا ہے، اس لیے مالک کو پورا کرایہ ملتا ہے۔ ڈیزل شامل نہیں (ڈرائی رینٹ)۔",
    ag_title: "ایگری ایجنٹ نیٹ ورک", ag_sub: "گاؤں کے دکاندار بغیر اسمارٹ فون والے کسانوں کو مشینری بک کرنے میں مدد دیتے ہیں۔",
    ag1_t: "ایگری ایجنٹ کون ہے؟", ag1_d: "گاؤں کی کریانہ یا موبائل لوڈ کی دکان، جسے بکنگ پوائنٹ کے طور پر تربیت دی جاتی ہے۔",
    ag2_t: "وہ کیا کرتے ہیں؟", ag2_d: "سروس سمجھاتے ہیں، کسانوں کو رجسٹر کرتے ہیں، مشینیں دکھاتے ہیں اور بکنگ بھیجتے ہیں۔",
    ag3_t: "وہ کیسے کماتے ہیں؟", ag3_d: "ہر مکمل بکنگ پر شفاف کمیشن، ایک واضح پالیسی کے تحت۔",
    ag4_t: "یہ کیوں اہم ہے", ag4_d: "آمنے سامنے اعتماد بنتا ہے اور کمزور سگنل والے علاقوں کے کسان بھی شامل ہوتے ہیں۔",
    ussd_title: "یو ایس ایس ڈی بکنگ", ussd_demo: "یو ایس ایس ڈی مینو کا جائزہ",
    ussd_steps: "ضمیمہ C فلو", ussd_hint: "کی پیڈ یا کی بورڈ استعمال کریں۔ بھیجنے کے لیے سبز بٹن دبائیں۔",
    kh_title: "ایگری شیئر کسان ہیلپر", kh_placeholder: "گھنٹے، خرچ یا مشین کے بارے میں پوچھیں...", kh_send: "بھیجیں",
    kh_hello: "السلام علیکم! میں کرائے کے گھنٹے، ڈرائی رینٹ خرچ کا اندازہ لگا سکتا ہوں اور مشین چننے میں مدد کر سکتا ہوں۔ اردو، انگریزی یا رومن اردو میں پوچھیں۔",
    kh_ai: "Claude AI", kh_offline: "اندرونی ہیلپر", kh_thinking: "سوچ رہا ہوں...",
    toast_booked: "بکنگ کی درخواست مالک کو بھیج دی گئی۔", toast_listed: "جمع ہو گئی۔ ایگری شیئر ٹیم کی منظوری کے بعد مارکیٹ میں نظر آئے گی۔", toast_confirmed: "بکنگ کی تصدیق ہو گئی۔", toast_declined: "بکنگ مسترد کر دی گئی۔",
    toast_completed: "کرایہ مکمل ہو گیا۔", toast_feedback: "رائے جمع ہو گئی۔", toast_cancelled: "بکنگ کی درخواست منسوخ ہو گئی۔", toast_removed: "فہرست ہٹا دی گئی۔",
    sindhi_note: "سندھی مستقبل کی توسیع کا پیش منظر ہے۔ پائلٹ پنجابی اور اردو میں ہے۔",
    tr_fee: "ٹرانسپورٹ اختیاری: {km} کلومیٹر کے لیے +{fee}",
    bk_offer_toggle: "اپنی قیمت تجویز کریں",
    bk_offer_sub: "کرایہ زیادہ لگتا ہے؟ مالک کو پیشکش بھیجیں۔ وہ قبول، جوابی پیشکش یا انکار کر سکتا ہے۔",
    bk_offer_rate: "آپ کی فی گھنٹہ پیشکش (روپے)",
    bk_offer_tr: "آپ کی ٹرانسپورٹ پیشکش (روپے)",
    bk_offer_note: "مالک کے لیے پیغام (اختیاری)",
    bk_offer_note_ph: "مثلاً میں صرف 2 کلومیٹر دور ہوں، ٹرانسپورٹ کم کر دیں؟",
    bk_offer_min: "پیشکش {min} اور {max} کے درمیان ہو۔",
    bk_listed: "درج",
    bk_your_offer: "آپ کی پیشکش",
    bk_send_offer: "قیمت کی پیشکش بھیجیں",
    st_countered: "مالک کی جوابی پیشکش",
    offer_badge: "قیمت کی پیشکش",
    mb_counter: "مالک نے جوابی پیشکش بھیجی:",
    mb_accept_counter: "جوابی پیشکش قبول کریں",
    mb_decline_counter: "انکار",
    mb_offer_line: "آپ کی پیشکش: {rate}/گھنٹہ",
    mb_signin: "اپنی بکنگز دیکھنے کے لیے سائن ان کریں۔",
    ow_offer_from: "کسان کی پیشکش",
    ow_accept_offer: "پیشکش قبول کریں",
    ow_counter: "جوابی پیشکش",
    ow_send_counter: "جوابی پیشکش بھیجیں",
    ow_counter_rate: "آپ کا فی گھنٹہ کرایہ (روپے)",
    ow_counter_tr: "ٹرانسپورٹ (روپے)",
    ow_note: "پیغام",
    toast_offer: "قیمت کی پیشکش مالک کو بھیج دی گئی۔",
    toast_countered: "جوابی پیشکش کسان کو بھیج دی گئی۔",
    nav_members: "اراکین",
    auth_signin: "سائن ان",
    auth_signup: "سائن اپ",
    auth_signout: "سائن آؤٹ",
    au_title_in: "خوش آمدید",
    au_title_up: "اپنا ایگری شیئر اکاؤنٹ بنائیں",
    au_title_reset: "پاس ورڈ ری سیٹ کریں",
    au_sub: "بکنگ، قیمت کی پیشکش اور مشینری درج کرنے کے لیے سائن ان کریں۔",
    au_name: "پورا نام",
    au_email: "ای میل",
    au_phone: "موبائل نمبر",
    au_pass: "پاس ورڈ",
    au_pass2: "پاس ورڈ دوبارہ",
    au_role: "میں ہوں",
    role_renter: "کسان / کرایہ دار",
    role_owner: "مشینری مالک",
    role_agent: "ایگری ایجنٹ",
    au_district: "ضلع",
    au_consent: "میں متفق ہوں کہ ایگری شیئر میرا نام، ای میل، موبائل اور ضلع صرف اکاؤنٹ چلانے کے لیے محفوظ کرے (سیکشن 12.2)۔",
    au_create: "اکاؤنٹ بنائیں",
    au_login: "سائن ان",
    au_have: "پہلے سے اکاؤنٹ ہے؟",
    au_new: "ایگری شیئر پر نئے ہیں؟",
    au_forgot: "پاس ورڈ بھول گئے؟",
    au_reset_btn: "نیا پاس ورڈ رکھیں",
    au_reset_note: "اس ای میل سے رجسٹرڈ اکاؤنٹ کا پاس ورڈ آپ دوبارہ رکھ سکتے ہیں۔",
    au_back: "سائن ان پر واپس",
    au_err_name: "پورا نام لکھیں۔",
    au_err_email: "درست ای میل لکھیں۔",
    au_err_pass: "پاس ورڈ کم از کم 6 حروف کا ہو۔",
    au_err_pass2: "پاس ورڈ ایک جیسے نہیں۔",
    au_err_consent: "براہ کرم پرائیویسی نوٹ قبول کریں۔",
    au_err_wrong: "ای میل یا پاس ورڈ غلط ہے۔",
    au_err_none: "کوئی اکاؤنٹ نہیں ملا۔ پہلے سائن اپ کریں۔",
    au_err_exists: "اس لاگ ان سے اکاؤنٹ پہلے ہی موجود ہے۔ سائن ان کریں۔",
    au_err_taken: "یہ ای میل پہلے سے رجسٹرڈ ہے۔ سائن ان کریں۔",
    au_err_generic: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
    au_need: "جاری رکھنے کے لیے سائن ان کریں یا اکاؤنٹ بنائیں۔",
    au_local_note: "صرف اسی براؤزر میں محفوظ (مشترکہ ریکارڈ یہاں دستیاب نہیں)۔",
    toast_welcome: "خوش آمدید، {name}!",
    toast_signedout: "آپ سائن آؤٹ ہو گئے۔",
    toast_registered: "اکاؤنٹ بن گیا۔ ایگری شیئر میں خوش آمدید!",
    toast_reset: "پاس ورڈ تبدیل ہو گیا۔ سائن ان کریں۔",
    mem_title: "رجسٹرڈ اراکین",
    mem_sub: "ایگری شیئر پر سائن اپ کرنے والے تمام افراد، ای میل اور کردار کے ساتھ۔",
    mem_total: "کل اراکین",
    mem_search: "نام، ای میل یا ضلع تلاش کریں",
    mem_empty: "ابھی کسی نے رجسٹر نہیں کیا۔",
    mem_joined: "شمولیت",
    mem_last: "آخری سائن ان",
    mem_copy: "CSV کاپی کریں",
    mem_copied: "کاپی ہو گیا",
    mem_cloud: "براہ راست مشترکہ ریکارڈ۔ یہ فہرست صرف آپ (مالک) اور ایڈیٹرز دیکھ سکتے ہیں۔",
    mem_local: "ریکارڈ صرف اس براؤزر میں محفوظ ہیں۔",
    mem_loading: "اراکین لوڈ ہو رہے ہیں...",
    mem_slow: "ریکارڈ لوڈ ہونے میں وقت لگ رہا ہے۔",
    nav_admin: "ایڈمن پینل",
    ad_title: "ایڈمن پینل",
    ad_sub: "نئی مشینری کی تصدیق کریں، بکنگز اور کمیشن دیکھیں اور پلیٹ فارم ریٹ مقرر کریں۔",
    ad_lock_title: "ایڈمن رسائی",
    ad_lock_sub: "کنٹرول پینل کھولنے کے لیے ایڈمن پن لکھیں۔",
    ad_pin: "پن",
    ad_unlock: "کھولیں",
    ad_pin_wrong: "غلط پن۔ دوبارہ کوشش کریں۔",
    ad_lock: "لاک",
    ad_verify: "مشینری کی تصدیق",
    ad_ledger: "بکنگز اور کمیشن",
    ad_settings: "پلیٹ فارم سیٹنگز",
    ad_requests: "اپنی بولی درخواستیں",
    ad_pending: "تصدیق کی منتظر",
    ad_approve: "منظور",
    ad_reject: "مسترد",
    ad_none: "ابھی کچھ نہیں۔",
    ad_submitted: "جمع",
    ad_kpi_bookings: "کل بکنگز",
    ad_kpi_gtv: "کل لین دین کی مالیت",
    ad_kpi_comm: "کمایا گیا کمیشن",
    ad_kpi_pending: "زیر التوا کمیشن",
    ad_col_id: "بکنگ",
    ad_col_date: "تاریخ",
    ad_col_machine: "مشین",
    ad_col_renter: "کرایہ دار",
    ad_col_channel: "ذریعہ",
    ad_col_status: "صورتحال",
    ad_col_value: "مالیت",
    ad_col_comm: "کمیشن",
    ad_diesel: "قومی ڈیزل ریٹ (روپے فی لیٹر)",
    ad_diesel_sub: "یہ ریٹ پوری ایپ میں درخواست پوسٹ کریں (تینوں درجے، 100 کلومیٹر سمیت) اور کسان ہیلپر میں استعمال ہوتا ہے۔",
    ad_save: "محفوظ کریں",
    ad_updated: "آخری تبدیلی",
    ad_diesel_preview: "مثال: ہارویسٹر 4 گھنٹے میں تقریباً {l} لیٹر = {v} کا ڈیزل۔",
    ad_districts: "پائلٹ اضلاع",
    ad_districts_sub: "بند اضلاع کی مشینیں کسانوں اور نئی فہرستوں سے چھپ جاتی ہیں۔",
    ad_min_one: "کم از کم ایک ضلع آن رکھیں۔",
    ad_reset: "مارکیٹ ڈیٹا ری سیٹ کریں",
    ad_reset_sub: "نمونہ مشینیں ہٹاتا ہے، بکنگز، درخواستیں اور فصل کی پوسٹیں صاف کرتا ہے اور ڈیزل ریٹ ری سیٹ کرتا ہے۔",
    ad_reset_confirm: "تصدیق کے لیے دوبارہ دبائیں",
    ad_req_rate: "پیشکش",
    ad_req_tier: "پہنچا درجہ",
    rq_open: "کھلی",
    rq_booked: "بک ہو گئی",
    rq_closed: "بند",
    ls_pending: "تصدیق کی منتظر",
    ls_approved: "منظور شدہ",
    ls_rejected: "مسترد",
    toast_approved: "فہرست منظور، اب مارکیٹ میں موجود۔",
    toast_rejected: "فہرست مسترد۔",
    toast_diesel: "ڈیزل ریٹ پوری ایپ میں {v} فی لیٹر ہو گیا۔",
    toast_demo_reset: "مارکیٹ ڈیٹا ری سیٹ ہو گیا۔",
    lr_diesel_admin: "قومی ڈیزل ریٹ: {v} فی لیٹر",
    lr_recent: "آپ کی حالیہ درخواستیں",
    bk_smallholder: "چھوٹا کسان (5 ایکڑ سے کم)",
    bk_smallholder_sub: "عام 6% کی بجائے رعایتی 4% کمیشن۔",
    pay_paylater: "ابھی کٹائی، بعد میں ادائیگی (30% ابھی + 70% کٹائی کے بعد)",
    pl_now: "ابھی ادائیگی (30%)",
    pl_later: "کٹائی کے بعد (70%)",
    pl_partner: "قرض پارٹنر (مجوزہ)",
    pl_due: "70% واپسی کی مدت",
    pl_days: "دن",
    pl_due_on: "آخری تاریخ",
    pl_now_short: "ابھی",
    pl_risk: "70% رقم تیسرے فریق مائیکروفنانس پارٹنر کی طرف سے قرض ہے، واپسی کا خطرہ پارٹنر کا ہے۔ ایگری شیئر پر کوئی قرض خطرہ نہیں۔ پارٹنرز کے نام صرف مجوزہ ہیں (کوئی معاہدہ نہیں) اور پارٹنر فیس لاگو ہو سکتی ہے۔",
    pl_settled: "ادا ہو گیا",
    pl_pending: "70% باقی",
    pl_settled_by: "ایگری منڈی فروخت {id} سے خود بخود ادا ہوا۔",
    pl_settle_mandi: "ایگری منڈی پر فصل بیچ کر ادا کریں",
    kp_title: "اسمارٹ فون نہیں؟ سادہ فون سے بکنگ کریں",
    kp_sub: "کسی بھی سادہ فون سے ٹول فری ہیلپ لائن پر کال کریں یا USSD کوڈ ملائیں۔ پنجابی یا اردو آواز مرحلہ وار رہنمائی کرتی ہے اور بکنگ کی تصدیق SMS پر آتی ہے۔",
    kp_toll: "ٹول فری ہیلپ لائن",
    kp_ussd: "USSD کوڈ",
    kp_demo: "کسی بھی موبائل نیٹ ورک سے مفت۔",
    kp_ivr: "IVR آواز کے مراحل",
    kp_try: "کی پیڈ بکنگ آزمائیں",
    nav_mandi: "ایگری منڈی",
    am_title: "ایگری منڈی: اپنی فصل بیچیں",
    am_sub: "اپنی فصل اور قیمت پوسٹ کریں۔ رجسٹرڈ آٹا ملز، رائس ملز اور بڑے خریدار آپ کی قیمت پر لائیو بولی لگاتے ہیں۔ بہترین پیشکش چنیں۔",
    am_credit: "آپ کا باقی مشینری قرض (70%)",
    am_credit_n: "بکنگز ابھی کٹائی، بعد میں ادائیگی پر",
    am_closed_loop: "کلوزڈ لوپ ادائیگی",
    am_closed_title: "آپ کی فصل کی فروخت سے مشینری کا قرض خود بخود ادا",
    am_loop1: "صرف 30% پیشگی دے کر مشین کرائے پر لیں",
    am_loop2: "اپنی فصل کاٹیں",
    am_loop3: "ایگری منڈی پر تصدیق شدہ خریدار کو بیچیں",
    am_loop4: "باقی 70% پارٹنر کو ادا اور خالص منافع آپ کے جاز کیش یا ایزی پیسہ میں",
    am_crop: "فصل",
    crop_wheat: "گندم",
    crop_rice: "چاول",
    crop_maize: "مکئی",
    crop_cotton: "کپاس",
    am_qty: "مقدار (من، 40 کلو)",
    am_grade: "معیار",
    am_grade_a: "درجہ A (صاف، خشک)",
    am_grade_b: "درجہ B",
    am_rate: "آپ کی متوقع قیمت (روپے فی من)",
    am_bench_src: "مارکیٹ رہنمائی: تقریباً {r} فی من (حالیہ پنجاب منڈی رپورٹس سے)۔",
    am_bench_est: "مارکیٹ رہنمائی: تقریباً {r} فی من (تخمینی)۔",
    am_expected_total: "متوقع کل رقم",
    am_wallet: "ادائیگی وصول کریں",
    am_wallet_no: "والٹ موبائل نمبر",
    am_post: "فصل پوسٹ کریں اور بولیاں لیں",
    am_new: "نئی فروخت پوسٹ",
    am_recent: "آپ کی حالیہ فصل پوسٹس",
    am_mann: "من",
    am_st_open: "کھلی",
    am_st_sold: "فروخت",
    am_st_closed: "بند",
    am_bids: "خریداروں کی لائیو بولیاں",
    am_waiting: "خریدار بولی لگا رہے ہیں...",
    am_bids_n: "بولیاں",
    am_idle: "ملز اور بڑے خریداروں سے بولیاں لینے کے لیے فصل پوسٹ کریں۔",
    am_no_bids: "کوئی خریدار آپ کی قیمت پر نہیں آیا۔ تھوڑی کم قیمت یا نئی پوسٹ آزمائیں۔",
    am_type_flour: "آٹا مل",
    am_type_rice: "رائس مل",
    am_type_feed: "فیڈ / نشاستہ مل",
    am_type_ginning: "جننگ فیکٹری",
    am_type_bulk: "بڑا خریدار",
    am_sample: "نمونہ خریدار",
    am_above: "آپ کی قیمت سے زیادہ بولی",
    am_pickup: "خریدار کھیت سے اٹھائے گا",
    am_settlement: "ادائیگی کا جائزہ",
    am_gross: "فصل کی فروخت",
    am_minus_credit: "مشینری قرض کی واپسی (70%)",
    am_unsettled: "{v} قرض باقی رہے گا کیونکہ یہ فروخت پورا نہیں کرتی۔",
    am_net: "آپ کا خالص منافع",
    am_to_wallet: "خریدار کی ادائیگی کے بعد رقم آپ کے {w} {n} میں۔",
    am_confirm: "فروخت کنفرم کریں",
    am_done: "فروخت کنفرم اور ادائیگی مکمل۔",
    am_sold_to: "خریدار",
    am_demo_note: "ایگری شیئر ہر ادائیگی کا ریکارڈ رکھتا ہے۔",
    toast_sold: "فروخت کنفرم۔ {net} خالص منافع آپ کے والٹ میں۔",
    ad_kpi_credit: "باقی کٹائی قرض (پارٹنر کا)",
    kh_short: "کسان ہیلپر",
    kp_ivr_pa: "پنجابی IVR",
    kp_ivr_ur: "اردو IVR",
    ab_name: "اپنی بولی (اپنا ریٹ طے کریں)",
    ab_tag: "اپنا کرایہ بتائیں، قریبی مالکان آفرز بھیجیں گے",
    mode_demo_d: "ہر فیچر جانچنے کے لیے نمونہ ٹریکٹر اور مالکان کی فرضی آفرز شامل کرتا ہے۔",
    mode_sub: "عام صارفین ہمیشہ لائیو موڈ دیکھتے ہیں۔ نمونہ ڈیٹا صرف اس ڈیوائس پر آن ہوتا ہے۔",
    zs_title: "ایگری شیئر معاون سروس اور پارٹنر نیٹ ورک",
    zs_sub: "{place} کے قریب ابھی {machine} کا کوئی رجسٹرڈ مالک آن لائن نہیں۔ پھر بھی آپ کا کام ہو جائے گا۔ ایک راستہ چنیں:",
    zs_a: "تلاش کا دائرہ 100 کلومیٹر تک بڑھائیں",
    zs_a_d: "اپنی درخواست قریبی تحصیلوں اور اضلاع کے تصدیق شدہ مالکان تک بھیجیں۔ ٹرانسپورٹ اور ڈیزل کا خرچ پہلے ہی دکھایا گیا ہے:",
    zs_a_btn: "100 کلومیٹر تک بھیجیں",
    zs_a_done: "تلاش پہلے ہی 100 کلومیٹر تک ہو رہی ہے۔",
    zs_km: "{km} کلومیٹر دور",
    zs_transport: "ٹرانسپورٹ",
    zs_fuel: "ڈیزل",
    zs_total: "اندازاً کل",
    zs_b: "گاؤں کا ایگری ایجنٹ اور مقامی پارٹنر",
    zs_b_d: "اپنی درخواست ہمارے مقامی ایگری ایجنٹ اور پارٹنر رینٹل نیٹ ورک کو بھیجیں۔ ہماری ٹیم گاؤں کے ٹریکٹر مالکان سے بات کر کے 2 سے 4 گھنٹے میں SMS یا کال سے تصدیق کرے گی۔",
    zs_b_btn: "ایگری ایجنٹ ٹیم کو بھیجیں",
    zs_b_done: "ٹکٹ {id}: ایگری ایجنٹ 2 سے 4 گھنٹے میں {phone} پر کال کرے گا۔",
    zs_c: "مجھے اطلاع دیں اور رعایت پائیں",
    zs_c_d: "ہم آپ کی درخواست محفوظ کر لیں گے۔ جیسے ہی {district} میں کوئی مالک رجسٹر ہوگا، وہ آپ کو منتظر کسان کے طور پر دیکھے گا اور آپ کو اس بکنگ پر پلیٹ فارم فیس میں {pct}٪ رعایت ملے گی۔",
    zs_c_btn: "مجھے اطلاع دیں",
    zs_c_done: "محفوظ ہو گیا ({id})۔ {district} میں مالک رجسٹر ہوتے ہی ہم آپ کو بتائیں گے۔",
    zs_phone: "کال بیک کے لیے فون نمبر",
    zs_machine: "مطلوبہ مشین",
    ow_ownerphone: "مالک کا فون (کال اور واٹس ایپ)",
    ow_waiting: "آپ کے ضلع میں منتظر کسان",
    ow_waiting_sub: "جب یہاں کوئی مالک رجسٹرڈ نہیں تھا تب محفوظ کی گئی اصل درخواستیں۔ مناسب مشین لسٹ کریں اور پہلے ان سے رابطہ کریں۔",
    ow_waiting_none: "ابھی کوئی کسان منتظر نہیں۔",
    ow_waiting_list: "مناسب مشین لسٹ کریں",
    toast_waiting: "{district} میں {n} کسان پہلے سے {machine} کے منتظر ہیں۔",
    lr_listed: "مقررہ ریٹ · مالک تصدیق کرے گا",
    lr_step_locked: "مشین یا ریٹ بدلنے کے لیے نئی درخواست شروع کریں۔",
    toast_lr_sent: "درخواست {owner} کو بھیج دی گئی۔ وہ اپنے اونر پورٹل سے تصدیق کریں گے۔",
    mode_badge_live: "لائیو · صرف تصدیق شدہ مالکان",
    mode_badge_demo: "نمونہ ڈیٹا آن",
    au_err_provider: "فائر بیس میں ای میل/پاس ورڈ لاگ اِن بند ہے۔ فائر بیس کنسول میں Authentication > Sign-in method سے آن کریں۔",
    au_err_network: "فائر بیس سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔",
    au_err_admin_local: "ایڈمن اکاؤنٹ فائر بیس اکاؤنٹ ہونا چاہیے۔ اگر \"غلط پاس ورڈ\" آئے تو ایک بار سائن اپ کریں۔",
    ad403_title: "403 — صرف مجاز ایگری شیئر انتظامیہ",
    ad403_sub: "یہ حصہ صرف ایگری شیئر کے بانی اور مجاز ٹیم ایڈمنز کے لیے ہے۔",
    ad403_signin: "ایڈمن اکاؤنٹ سے سائن اِن کریں",
    ad403_home: "مارکیٹ پر واپس جائیں",
    ad403_local: "آپ {email} سے ایسے اکاؤنٹ میں سائن اِن ہیں جو صرف اس براؤزر میں ہے، فائر بیس میں نہیں۔ ایڈمن کے لیے فائر بیس اکاؤنٹ ضروری ہے۔",
    ad403_phone: "آپ فون نمبر سے سائن اِن ہیں۔ ایڈمن کے لیے بانی کا ای میل اکاؤنٹ ضروری ہے۔",
    ad403_other: "آپ {email} سے سائن اِن ہیں، جو مجاز ایڈمن ای میل نہیں۔",
    ad403_fix: "سائن آؤٹ کر کے فائر بیس سے سائن اِن کریں",
    dm_agent_dispatch: "ایگری ایجنٹ روانگی",
    dm_notify: "مجھے اطلاع دیں",
    dm_waiting: "منتظر",
    dm_contacted: "رابطہ ہو گیا",
    dm_matched: "مل گیا",
    mode_live: "لائیو پبلک موڈ",
    mode_live_d: "صرف رجسٹرڈ اصل مالکان۔ صرف اونر پورٹل سے آئی اور منظور شدہ مشینیں دکھائی جاتی ہیں۔",
    mode_demo: "نمونہ ڈیٹا",
    mode_title: "مارکیٹ موڈ",
    mode_load_demo: "نمونہ ڈیٹا لوڈ کریں",
    mode_go_live: "لائیو پبلک موڈ پر جائیں",
    toast_mode_live: "لائیو پبلک موڈ: صرف رجسٹرڈ اصل مالکان دکھائے جا رہے ہیں۔",
    toast_mode_demo: "اس ڈیوائس پر نمونہ ڈیٹا لوڈ ہو گیا۔",
    ad_demand: "منتظر طلب",
    ad_demand_none: "ابھی کوئی منتظر طلب نہیں۔",
    ad_demand_contacted: "رابطہ ہو گیا",
    ad_demand_matched: "مل گیا",
    ad_live: "لائیو درخواستیں اور بکنگز",
    ad_live_req: "اپنی بولی مشینری درخواستیں",
    ad_live_bk: "بکنگز",
    al_title: "نئی سرگرمی کے الرٹ",
    al_sub: "{n} چیزیں توجہ چاہتی ہیں",
    al_none: "سب نمٹ گیا۔ نئی مشینیں اور کسانوں کی درخواستیں یہاں فوراً آئیں گی۔",
    al_listing: "نئی مشین منظوری کی منتظر",
    al_request: "کسان کی درخواست",
    al_demand: "منتظر طلب کا ٹکٹ",
    al_booking: "بکنگ مالک کی منتظر",
    al_view: "دیکھیں",
    ct_call: "کال",
    ct_wa: "واٹس ایپ",
    ct_none: "فون نمبر موجود نہیں",
    ct_owner: "مالک",
    ct_farmer: "کسان",
    ct_rent_dry: "ڈرائی رینٹ (ڈیزل کسان کا)",
    ct_rent_wet: "ویٹ رینٹ (ڈیزل شامل)",
    ct_model: "مشین",
    ct_rate: "فی گھنٹہ ریٹ",
    ct_offered: "پیشکش",
    ct_needed: "مطلوبہ مشین",
    ct_location: "مقام",
    ct_time: "وقت",
    cloud_nodb: "فائر اسٹور ڈیٹا بیس نہیں ملا",
    cloud_denied: "فائر اسٹور نے رسائی روک دی: رولز شائع کریں",
    cloud_detail: "فائر اسٹور ڈیٹا بیس \"{db}\":",
    adv_title: "جاری رکھنے کے لیے اپنی ای میل کی تصدیق کریں",
    adv_sub: "ایڈمن کے لیے تصدیق شدہ ای میل ({email}) ضروری ہے۔ ہم تصدیقی لنک بھیجیں گے۔",
    adv_send: "تصدیقی ای میل بھیجیں",
    adv_sent: "تصدیقی ای میل بھیج دی گئی۔ لنک کھولیں، پھر \"میں نے تصدیق کر لی\" دبائیں۔",
    adv_check: "میں نے تصدیق کر لی",
    adv_still: "آپ کی ای میل کی ابھی تصدیق نہیں ہوئی۔",
    adp_opening: "کنٹرول روم کھل رہا ہے",
    adp_enter_title: "بانی کا پن",
    adp_enter_sub: "{email} سے سائن اِن۔ اضافی پن آن ہے: کنٹرول روم کھولنے کے لیے پن درج کریں۔",
    adp_pass: "پن",
    adp_new: "نیا پن",
    adp_confirm: "پن دوبارہ لکھیں",
    adp_current: "موجودہ پن",
    adp_unlock: "کنٹرول روم کھولیں",
    adp_save: "محفوظ کر کے کھولیں",
    adp_short: "کم از کم {n} حروف رکھیں۔",
    adp_mismatch: "دونوں پن ایک جیسے نہیں۔",
    adp_wrong: "غلط پن۔",
    adp_locked: "بہت زیادہ کوششیں۔ {s} سیکنڈ بعد دوبارہ کوشش کریں۔",
    adp_load_err: "اکاؤنٹ تازہ نہیں ہو سکا۔ کنکشن چیک کر کے دوبارہ کوشش کریں۔",
    adp_save_err: "محفوظ نہیں ہو سکا۔ کنکشن چیک کریں اور یقینی بنائیں کہ firestore.rules شائع ہیں۔",
    adp_cloud_queued: "محفوظ ہو گیا۔ کنکشن واپس آنے پر فائر اسٹور میں چلا جائے گا۔",
    adp_cloud_denied: "فائر اسٹور نے تبدیلی روک دی۔ تازہ firestore.rules شائع کریں اور ای میل کی تصدیق کریں۔",
    adp_offline: "فائر اسٹور سے رابطہ نہیں ہو سکا۔",
    adp_waiting: "بانی نے ابھی پن مقرر نہیں کیا۔",
    adp_create_title: "پن مقرر کریں",
    adp_create_sub: "یہ پن کنٹرول روم کھولتا ہے۔",
    ads_tab: "سیکیورٹی",
    ads_title: "سیکیورٹی اور ایڈمن رسائی",
    ads_change: "پن تبدیل کریں",
    ads_changed: "پن تبدیل ہو گیا۔ اب یہ ہر ڈیوائس پر لاگو ہے۔",
    ads_founder_only: "پن اور ٹیم لسٹ صرف بانی بدل سکتا ہے۔",
    ads_pin_title: "بانی سیشن لاک (اختیاری پن)",
    ads_pin_sub: "عام طور پر بند: آپ کی تصدیق شدہ بانی ای میل ہر ڈیوائس پر ایڈمن پینل کھولتی ہے۔ آن کرنے پر پن بھی پوچھا جائے گا۔ یہ صرف فائر اسٹور میں محفوظ ہوتا ہے، اس لیے ہر ڈیوائس پر ایک ہی پن چلتا ہے۔",
    ads_pin_status_on: "پن آن",
    ads_pin_status_off: "پن بند",
    ads_pin_enable: "پن آن کریں",
    ads_pin_disable: "پن بند کریں",
    ads_pin_on: "پن ہر ڈیوائس کے لیے آن ہو گیا۔",
    ads_pin_off: "پن بند ہو گیا۔ آپ کی تصدیق شدہ ای میل ایڈمن پینل کھولتی ہے۔",
    ads_team: "مجاز ٹیم ایڈمنز",
    ads_team_sub: "ٹیم ایڈمن اپنی تصدیق شدہ ای میل سے ایڈمن پینل کھولتے ہیں (پن آن ہو تو پن بھی)۔",
    ads_team_add: "شامل کریں",
    ads_team_none: "ابھی کوئی ٹیم ایڈمن نہیں۔",
    ads_team_saved: "ٹیم ایڈمن لسٹ محفوظ ہو گئی۔",
    ads_founder: "بانی",
    ads_last: "پن آخری بار {d} کو {e} نے بدلا",
    vc_no_speech: "کوئی آواز نہیں سنی — دوبارہ کوشش کے لیے مائیک دبائیں۔",
    vc_again: "دوبارہ بولنے کے لیے دبائیں",
    vc_replay: "سنیں"
  },
  pa: {
    vc_mic_blocked: "مائیک دی اجازت نئیں ملی۔ براؤزر دیاں سیٹنگاں وچ مائیک دی اجازت دیو، فیر دوبارہ بولن لئی دباؤ۔",
    vc_demo_btn: "مثال سنو",
    vc_retry: "مائیک دوبارہ آزمائیں",
    vc_no_mic: "مائیک نئیں لبھیا۔ مائیک لاؤ، فیر دوبارہ بولن لئی دباؤ۔",
    vc_net: "آواز پچھانن لئی انٹرنیٹ چاہیدا اے۔ کنکشن ویکھو، فیر دوبارہ بولن لئی دباؤ۔",
    vc_lang_unsupported: "ایہ براؤزر ایس زبان وچ نئیں سن سکدا۔ کروم ورتو یا 'مثال سنو' دباؤ۔",
    vc_no_voice: "ایس ڈیوائس تے اردو آواز نئیں، ایس لئی جواب رومن اردو وچ پڑھے جا رہے نیں۔ اردو سنن لئی اردو آواز انسٹال کرو (اینڈرائیڈ: سیٹنگز > ٹیکسٹ ٹو اسپیچ)۔",
    nav_activity: "سرگرمی",
    nav_s_market: "مارکیٹ",
    nav_s_live: "درخواست",
    nav_s_mandi: "فصل بیچیں",
    nav_s_bookings: "بکنگ",
    nav_s_owner: "مالک",
    nav_s_agent: "ایجنٹ",
    nav_s_more: "مزید",
    hero_role_farmer: "کسان",
    hero_need: "مشین چاہیے؟",
    hero_role_owner: "مالک",
    hero_earn: "اپنی مشین سے کمائیں",
    hero_live: "ایگری شیئر پر لائیو",
    hero_machines: "اس خطے میں درج مشینیں",
    hero_owners: "مالکان",
    hero_bookings: "اس ڈیوائس پر بکنگز",
    tr1_t: "تصدیق شدہ مالکان",
    tr1_s: "ہر لسٹنگ لائیو ہونے سے پہلے ایگری شیئر ٹیم جانچتی ہے",
    tr2_t: "4% سے 6% منصفانہ کمیشن",
    tr2_s: "5 ایکڑ سے کم والے کسانوں کے لیے صرف 4%",
    tr3_t: "30/70 فصل کریڈٹ",
    tr3_s: "ابھی 30%، فصل کے بعد 70% (مجوزہ پارٹنرز)",
    tr4_t: "24/7 ہیلپ لائن اور آواز",
    tr4_s: "ٹول فری یو اے این تے کسان ہیلپر وائس اسسٹنٹ",
    ov_dry: "ڈرائی رینٹ",
    ov_op: "آپریٹر شامل",
    toast_broadcast_t: "درخواست بھیج دی گئی",
    toast_broadcast: "{n} قریبی مالکان کو بھیجی گئی۔ کوئی قبول نہ کرے تو دائرہ خود بڑھے گا۔",
    toast_broadcast0: "قریبی مالکان تلاش ہو رہے ہیں۔ دائرہ خود بڑھے گا۔",
    toast_booked_t: "بکنگ ہو گئی",
    toast_offer_t: "پیشکش بھیج دی",
    toast_synced: "کلاؤڈ پر محفوظ۔",
    toast_local: "اس ڈیوائس پر محفوظ۔",
    act_title: "میری سرگرمی",
    act_sub: "بکنگ، لائیو درخواستیں اور ایگری مارکیٹ سودے ایک جگہ",
    act_bookings: "بکنگ",
    act_requests: "درخواستیں",
    act_deals: "سودے",
    act_voucher: "واؤچر",
    act_view_voucher: "واؤچر دیکھیں",
    act_empty_b: "ابھی کوئی بکنگ نہیں۔",
    act_empty_r: "ابھی کوئی لائیو درخواست نہیں۔",
    act_empty_d: "ابھی کوئی فصل پوسٹ نہیں۔",
    act_all: "مکمل بکنگ صفحہ کھولیں",
    act_sold: "فروخت",
    act_open: "کھلی",
    vo_title: "ڈیجیٹل بکنگ واؤچر",
    vo_ref: "حوالہ",
    vo_issued: "جاری",
    vo_verified: "بکنگ ایگری شیئر پر درج ہے",
    vo_cancelled: "یہ بکنگ منسوخ یا مسترد ہو گئی",
    vo_track: "لائیو اسٹیٹس",
    vo_s1: "مالک نے تصدیق کی",
    vo_s2: "مشین راستے میں",
    vo_s3: "کام مکمل",
    vo_waiting: "مالک کی تصدیق کا انتظار ہے۔",
    vo_mark_route: "مالک: مشین رستے وچ اے",
    vo_machine: "مشین",
    vo_date: "تاریخ اور گھنٹے",
    vo_location: "ضلع",
    vo_renter: "کسان",
    vo_items: "خرچ کی تفصیل",
    vo_total: "کل رقم",
    vo_fuel: "ڈیزل کا اندازہ",
    vo_print: "پرنٹ / PDF",
    vo_download: "ڈاؤن لوڈ",
    vo_close: "بند کریں",
    vo_note: "یہ بکنگ آئی ڈی مالک یا اپنے ایگری ایجنٹ کو دکھائیں۔",
    vo_pattern_note: "مشین دیندیاں ایہ بیج تے بکنگ نمبر مالک نوں وکھاؤ۔",
    lr_diesel_note_intl: "ایس علاقے وچ ڈیزل دی عام قیمت۔ ڈرائی رینٹ وچ ڈیزل کسان آپ لیندا اے۔",
    country: "ملک / خطہ",
    country_PK: "پاکستان",
    country_CN: "چین",
    country_IN: "بھارت",
    country_US: "امریکہ / یورپ",
    country_ME: "مشرق وسطیٰ / افریقہ",
    fx_note: "قیمتاں مقامی کرنسی وچ حوالہ ریٹ تے (1 ڈالر ≈ 278 روپے ≈ 6.67 یوآن ≈ 94 بھارتی روپے)۔ علاقائی ریٹ منڈی دے اندازے نیں۔",
    one_leveler: "لیزر لینڈ لیولر",
    one_planter: "سیڈ ڈرل / پلانٹر",
    one_drone: "اسپرے ڈرون",
    one_implement: "آلات / پمپ",
    cat_leveler: "لیولر",
    cat_planter: "پلانٹر",
    cat_drone: "ڈرون",
    cat_implement: "آلات",
    lr_steps: "درخواست کے مراحل",
    lr_step1: "مشین کی قسم",
    lr_step2: "مقام اور پیشکش",
    lr_step3: "لائیو آفرز",
    lr_choose: "تہانوں کیہڑی مشین چاہیدی اے؟",
    lr_choose_sub: "پہلاں مشین دی قسم چنو، فیر اپنا ریٹ دسو۔ {country} دے ماڈل تے ریٹ۔",
    cat_rates_note: "عام منڈی ریٹ، پکی قیمت نئیں۔",
    lr_est_rate: "اندازاً فی گھنٹہ ریٹ",
    lr_select: "چنو تے اگے ودھو",
    lr_selected: "منتخب",
    lr_change_machine: "بدلو",
    lr_pref_model: "پسندیدہ ماڈل (اختیاری)",
    lr_any_model: "کوئی وی ماڈل",
    lr_diesel_intl: "مقامی ڈیزل قیمت: {v}/لیٹر",
    lr_fuel_battery: "بیٹری سے چلتا ہے: ڈیزل کی ضرورت نہیں۔",
    ow_suggest: "{country} کے تجویز کردہ ماڈل (نام، تفصیل اور ریٹ بھرنے کے لیے دبائیں)",
    loc_sub_intl: "علاقہ چنیں، گاؤں یا فارم لکھیں، یا GPS استعمال کریں۔",
    loc_regions: "زرعی علاقے",
    loc_map_pk_only: "انٹرایکٹو نقشہ صرف پاکستان کا ہے۔ دوسرے ممالک میں قریبی علاقہ چنیں، گاؤں لکھیں یا درست پن کے لیے GPS استعمال کریں۔",
    lr_tier1_t_intl: "مفت یا کم مقامی ٹرانسپورٹ",
    lr_tier2_t_intl: "درمیانی ٹرانسپورٹ، فی کلومیٹر ہر طرف",
    op_optional_intl: "آپریٹر (ڈرائیور) اختیاری، اضافی فی گھنٹہ خرچ",
    tr_optional_intl: "ٹرانسپورٹ اختیاری (فی کلومیٹر، کم از کم خرچ کے ساتھ)",
    au_method: "سائن ان کا طریقہ",
    au_m_email: "ای میل",
    au_m_phone: "فون OTP",
    au_phone_hint: "پاکستانی موبائل، مثلاً 0300 1234567۔ آپ کو 6 ہندسوں کا کوڈ بھیجا جائے گا۔",
    au_otp: "کوڈ {phone} پر بھیجا گیا",
    au_otp_err: "6 ہندسوں کا کوڈ لکھیں۔",
    au_otp_send: "کوڈ بھیجو",
    au_otp_verify: "تصدیق کریں اور آگے بڑھیں",
    au_otp_resend: "نمبر بدلیں یا دوبارہ کوڈ بھیجیں",
    au_otp_wrong: "کوڈ غلط ہے یا ختم ہو گیا۔ دوبارہ کوشش کریں۔",
    au_otp_limit: "بہت زیادہ کوششیں۔ چند منٹ انتظار کریں یا ای میل استعمال کریں۔",
    au_phone_off: "فون سائن ان ابھی دستیاب نہیں (Firebase صرف Blaze پلان پر SMS بھیجتا ہے)۔ ای میل استعمال کریں۔",
    role_buyer: "فصل خریدار",
    cloud_live: "لائیو: Firestore سنک آن",
    cloud_connecting: "Firestore سے رابطہ ہو رہا ہے…",
    cloud_partial: "جزوی سنک: بکنگ سنک کرنے کے لیے سائن ان کریں",
    cloud_offline: "آف لائن: اس ڈیوائس پر محفوظ",
    cloud_local: "صرف ایس ڈیوائس تے محفوظ",
    au_reset_email_note: "نواں پاس ورڈ رکھن دا لنک تہاڈی ای میل تے بھیجیا جاوے گا۔",
    toast_reset_link: "پاس ورڈ ری سیٹ لنک بھیج دیا گیا۔ اپنی ای میل (اور اسپام) دیکھیں۔",
    loc_nearest_beyond: "تہاڈے گھیرے توں باہر سب توں نیڑے مشیناں (ٹرانسپورٹ مہنگی):",
    loc_title: "اپنی تھاں چنو",
    loc_sub: "پاکستان میں کہیں بھی: صوبہ اور ضلع چنیں، گاؤں لکھیں، نقشے پر پن لگائیں یا GPS استعمال کریں۔",
    loc_province: "صوبہ / علاقہ",
    loc_district: "ضلع",
    loc_district_ph: "کوئی بھی ضلع تلاش کریں، مثلاً لاڑکانہ، سوات، تربت",
    loc_village: "پنڈ / چک / تحصیل",
    loc_village_ph: "مثلاً چک 45 گ ب، تحصیل جڑانوالہ",
    loc_gps: "میری موجودہ GPS تھاں ورتو",
    loc_gps_wait: "آپ کا مقام تلاش ہو رہا ہے…",
    loc_gps_denied: "مقام کی اجازت بند ہے۔ نقشے پر پن لگائیں۔",
    loc_gps_unsupported: "یہ براؤزر GPS نہیں دے سکتا۔ نقشے پر پن لگائیں۔",
    loc_gps_outside: "آپ کا GPS مقام پاکستان سے باہر ہے۔ نقشے پر پن لگائیں۔",
    loc_map_hint: "پن لگانے کے لیے نقشے پر ٹیپ کریں۔ ضلع چننے کے لیے نقطے پر ٹیپ کریں۔",
    loc_pin: "پن لگ گیا",
    loc_none: "ابھی پن نہیں",
    loc_nearest: "قریبی ضلع",
    loc_save: "تھاں سانبھو",
    loc_clear: "صاف کریں",
    loc_change: "تبدیل کریں",
    loc_set: "مقام لگائیں",
    loc_fit: "پورا پاکستان دکھائیں",
    loc_err: "مہربانی کر کے اپنی تھاں لاؤ۔",
    loc_your: "تہاڈے کھیت دی تھاں",
    loc_road: "سڑک کا اندازہ",
    loc_far: "{place} دے {km} کلومیٹر اندر ہلے کوئی مشین نئیں۔ گھیرا ودھاؤ یا درخواست پاؤ۔",
    loc_try_live: "لائیو درخواست بھیجیں",
    loc_dist_note: "فاصلے آپ کے پن سے سڑک کا اندازہ ہیں۔",
    loc_dist_hint: "درست فاصلہ اور ٹرانسپورٹ خرچ دیکھنے کے لیے اپنا مقام لگائیں۔",
    loc_machine: "مشین کتھے رکھی اے؟",
    loc_farm: "کھیت دی تھاں",
    f_province: "صوبہ",
    all_provinces: "تمام صوبے",
    ad_provinces: "فعال صوبے",
    ad_provinces_sub: "ان صوبوں سے باہر کی لسٹنگ مارکیٹ میں نہیں دکھائی جاتی۔",
    ad_min_one_prov: "کم از کم ایک صوبہ فعال رکھیں۔",
    vc_title: "لائیو آواز کال",
    vc_start: "آواز کال شروع کرو",
    vc_end: "آواز کال مکاؤ",
    vc_ready: "تیار",
    vc_listening: "سن رہیا واں… بولو",
    vc_thinking: "سمجھ رہیا واں…",
    vc_speaking: "بول رہیا واں…",
    vc_tap: "مائیک دباؤ تے بولو",
    vc_tap_btn: "بولن لئی دباؤ",
    vc_done_speaking: "بات مکمل",
    vc_demo: "مثال",
    vc_you_said: "تسیں آکھیا",
    vc_mute: "آواز بند",
    vc_unmute: "آواز کھولو",
    vc_mic_error: "مائیک شروع نئیں ہویا۔ فیر کوشش کرو یا مثال چلاؤ۔",
    vc_unsupported: "ایس براؤزر وچ آواز نال گل نئیں ہو سکدی۔ اینڈرائیڈ یا کمپیوٹر تے کروم یا ایج ورتو، یا سوال لکھ دیو۔",
    vc_tts_off: "آواز میں جواب بند ہیں۔ جواب متن میں نظر آئیں گے۔",
    vc_engine_claude: "Claude کی آواز۔ ہر بار بولنے کے لیے دبائیں۔",
    vc_engine_browser: "براؤزر کی آواز۔ ہر جواب کے بعد خود دوبارہ سنتا ہے۔",
    vc_lang_note: "اس زبان کے لیے آواز اردو میں سنی اور پڑھی جاتی ہے۔",
    nav_live: "درخواست پاؤ",
    cta_live: "درخواست پاؤ (اپنی بولی)",
    lr_title: "اپنی بولی: مشینری لئی اپنا ریٹ دسو",
    lr_sub: "اپنی قیمت آپ دسو۔ نیڑے دے مالک ریڈار تے تہاڈی درخواست ویکھ کے مندے یا جوابی پیشکش گھلدے نیں۔ نیڑے کوئی ویہلا نہ ہووے تے گھیرا ودھاؤ۔",
    lr_machine: "لوڑیندی مشین",
    lr_village: "تہاڈا پنڈ / تھاں",
    lr_hours: "لوڑیندے گھنٹے",
    lr_date: "تاریخ",
    lr_rate: "تہاڈی پیشکش (روپے فی گھنٹہ)",
    lr_rate_hint: "نیڑے دا عام ریٹ: {r} فی گھنٹہ",
    lr_rent: "کرائے دی قسم",
    lr_dry: "ڈرائی رینٹ",
    lr_dry_d: "ڈیزل تہاڈا",
    lr_wet: "ویٹ رینٹ",
    lr_wet_d: "ڈیزل مالک دا، منڈی ریٹ تے",
    lr_diesel: "ڈیزل ریٹ (روپے فی لیٹر)",
    lr_diesel_note: "ایگری شیئر ٹیم دا رکھیا منڈی ریٹ۔ پاکستان وچ ڈیزل دی قیمت اکثر بدلدی اے۔",
    lr_peak: "کٹائی دا رجھیا موسم",
    lr_peak_d: "پنڈ تے پائلٹ علاقے دیاں مشیناں رجھیاں نیں، ایس لئی تلاش تیجے درجے تک جاوے گی۔",
    lr_post: "درخواست پاؤ تے مالک لبھو",
    lr_new: "نویں درخواست",
    lr_radar: "لائیو ریڈار",
    lr_compare: "تناں گھیریاں دا مقابلہ",
    lr_idle: "تلاش شروع کرن لئی درخواست پاؤ۔",
    lr_scanning: "{tier} وچ تلاش جاری...",
    lr_offers_count: "لائیو پیشکشاں",
    lr_offers: "مالکاں دیاں لائیو پیشکشاں",
    lr_idle_offers: "مالکاں دیاں پیشکشاں ایتھے فوراً آؤن گیاں۔",
    lr_waiting: "مالکاں دے جواب دی اڈیک...",
    lr_no_match: "{tier} وچ کوئی مشین نئیں لبھی۔",
    lr_expand: "تلاش {tier} تک ودھاؤ",
    lr_raise: "پیشکش ودھاؤ یا تاریخ بدلو۔",
    lr_eta: "پہنچن دا ویلا",
    lr_accepts: "تہاڈا ریٹ منظور",
    lr_counter: "جوابی پیشکش",
    lr_grand: "کل رقم",
    lr_free: "مفت",
    lr_accept: "منو",
    lr_decline: "انکار",
    lr_confirm: "بکنگ پکی کرو",
    lr_confirmed: "بکنگ ہو گئی! میریاں بکنگاں وچ ویکھو۔",
    lr_compare_sub: "اکو درخواست، ہر درجے دا سب توں نیڑے مالک۔ اک کلک نال اوہ درجہ ریڈار تے فیر اسکین ہووے گا۔",
    lr_nearest: "سب توں نیڑے مالک",
    lr_base: "مشین دا بنیادی کرایہ",
    lr_test_tier: "ایہہ درجہ اسکین کرو",
    lr_compare_hint: "پہلاں درخواست پاؤ، فیر ایہناں بٹناں نال ہر گھیرے دا مقابلہ کرو۔",
    lr_legend_offer: "پیشکش آئی",
    lr_legend_scan: "گھیرے وچ مالک",
    lr_legend_busy: "رجھیا",
    lr_you: "تسیں",
    lr_alert3: "دور دی بکنگ: ٹرانسپورٹ تے ڈیزل دا خرچہ ودھ اے۔ پکی کرن توں پہلاں پورا خرچہ ویکھ لو۔",
    lr_breakdown: "خرچے دی پوری تفصیل",
    lr_transport_local: "مقامی ٹرانسپورٹ",
    lr_transport: "ٹرانسپورٹ ({km} کلومیٹر × 2 پاسے × {rate} روپے)",
    lr_fuel_wet: "ڈیزل (ویٹ رینٹ، مالک دا بل)",
    lr_platform_bill: "ایگری شیئر راہیں ادائیگی",
    lr_fuel_dry: "تہاڈا اپنا ڈیزل (ڈرائی رینٹ، پمپ تے)",
    lr_fuel_est: "ڈیزل دا اندازہ: فی گھنٹہ {l} لیٹر، اج دی منڈی قیمت تے۔",
    lr_tier1: "درجہ 1: پنڈ دا علاقہ",
    lr_tier1_r: "1 توں 5 کلومیٹر",
    lr_tier1_t: "مفت یا گھٹ مقامی ٹرانسپورٹ (0 توں 500 روپے)",
    lr_tier2: "درجہ 2: پائلٹ علاقہ",
    lr_tier2_r: "15 توں 25 کلومیٹر",
    lr_tier2_t: "درمیانی ٹرانسپورٹ، 60 روپے فی کلومیٹر ہر پاسے",
    lr_tier3: "درجہ 3: علاقائی بیک اپ",
    lr_tier3_r: "100 کلومیٹر تک",
    lr_tier3_t: "وڈھی دے رش وچ ہنگامی سہولت، لمی ٹرانسپورٹ",
    toast_lr_booked: "{owner} نال بکنگ پکی۔",
    mb_via_live: "اپنی بولی راہیں بکنگ",
    ow_no_history: "ہلے کوئی جواب نئیں۔",
    nav_market: "مشینری منڈی", nav_bookings: "میریاں بکنگاں", nav_owner: "مالک پورٹل", nav_agent: "ایگری ایجنٹ تے USSD",
    tagline: "وسیلے ونڈو، رل کے ودھو",
    hero_kicker: "پنجاب پائلٹ · ٹریکٹر · تھریشر · ہارویسٹر",
    hero_title: "مشین خریدنا ضروری نئیں، کرائے تے لوو۔",
    hero_owner: "تہاڈی ویہلی مشینری کرائے نال کما سکدی اے۔",
    hero_desc: "اپنے پنڈ دے نیڑے ٹریکٹر، تھریشر تے ہارویسٹر لبھو، بکنگ توں پہلاں پورا ڈرائی رینٹ ریٹ ویکھو تے کجھ منٹاں وچ درخواست گھلو۔",
    cta_find: "مشینری لبھو", cta_list: "اپنی مشین لکھاؤ",
    stat_pilot: "پنجاب پائلٹ علاقے", stat_radius: "کلومیٹر ایپ تلاش", stat_comm: "پلیٹ فارم کمیشن", stat_cats: "مشیناں دیاں قسماں",
    how_title: "ایگری شیئر کیویں کم کردا اے",
    how1: "مالک ویہلی مشین لکھاندا اے", how2: "کسان 15 کلومیٹر وچ لبھدا اے", how3: "پورا ڈرائی رینٹ ریٹ ویکھدا اے", how4: "مالک پکی کردا اے، کم ہوندا اے",
    filters: "فلٹر", f_category: "مشین دی قسم", cat_all: "ساریاں", cat_tractor: "ٹریکٹر", cat_thresher: "تھریشر", cat_harvester: "ہارویسٹر",
    one_tractor: "ٹریکٹر", one_thresher: "تھریشر", one_harvester: "ہارویسٹر",
    f_district: "پنجاب دا ضلع", all_districts: "سارے ضلعے", f_radius: "تلاش دا گھیرا", f_search: "مشین یا پنڈ لبھو",
    km: "کلومیٹر", radius_note: "ڈیفالٹ 15 کلومیٹر، ودھ توں ودھ 25 کلومیٹر",
    results: "{n} مشیناں لبھیاں", no_results: "ایہناں فلٹراں نال کوئی مشین نئیں لبھی۔ گھیرا ودھاؤ یا سارے ضلعے چنو۔", reset: "فلٹر ری سیٹ کرو",
    per_hour: "/گھنٹہ", rate_label: "فی گھنٹہ ریٹ", distance: "دور", dry_rent: "ڈرائی رینٹ: ڈیزل شامل نئیں",
    op_included: "آپریٹر (ڈرائیور) کرائے وچ شامل", op_optional: "آپریٹر (ڈرائیور) مرضی دا: +500 روپے/گھنٹہ", op_none: "آپریٹر نئیں: اپنا ڈرائیور لیاؤ",
    tr_included: "ٹرانسپورٹ شامل", tr_optional: "ٹرانسپورٹ مرضی دی (100 روپے فی کلومیٹر، گھٹ توں گھٹ 500)", tr_self: "ٹرانسپورٹ کسان دے ذمے",
    request: "بکنگ دی درخواست", unavailable: "ہن دستیاب نئیں", owner: "مالک", new_badge: "نویں لسٹ",
    bk_title: "بکنگ دی درخواست", bk_date: "کرائے دی تاریخ", bk_hours: "کم دے گھنٹے", bk_operator: "آپریٹر شامل کرو", bk_transport: "ٹرانسپورٹ شامل کرو",
    bk_breakdown: "ریٹ دی صاف تفصیل", bk_base: "بنیادی ڈرائی رینٹ", bk_op: "آپریٹر", bk_tr: "ٹرانسپورٹ", bk_sub: "ذیلی کل",
    bk_comm: "پلیٹ فارم کمیشن ({p})", bk_total: "کل اندازاً رقم", bk_fuel_line: "ڈیزل: کسان دیوے گا (ریٹ وچ شامل نئیں)",
    bk_ack: "میں سمجھدا/سمجھدی آں کہ ایہہ ڈرائی رینٹ اے: ڈیزل میں دیواں گا/گی، تے اوور ٹائم تے دیر نال واپسی دیاں شرطاں پکی کرن توں پہلاں مالک نال طے ہون گیاں۔",
    bk_pay: "ادائیگی دا طریقہ", bk_pay_note: "ایزی پیسہ، جاز کیش یا اپنے ایگری ایجنٹ راہیں نقد دیو۔",
    pay_easypaisa: "ایزی پیسہ", pay_jazzcash: "جاز کیش", pay_agent: "مقامی ایگری ایجنٹ راہیں نقد",
    bk_name: "تہاڈا ناں", bk_phone: "موبائل نمبر", bk_privacy: "صرف ایس بکنگ لئی ورتیا جاوے گا (سیکشن 12.2)۔",
    bk_submit: "بکنگ دی درخواست گھلو", cancel: "منسوخ", close: "بند کرو", included_word: "شامل", not_added: "شامل نئیں",
    err_date: "کرائے دی تاریخ چنو۔", err_name: "اپنا ناں لکھو۔", err_phone: "ٹھیک موبائل نمبر لکھو (03XXXXXXXXX)۔", err_ack: "مہربانی کر کے ڈرائی رینٹ دیاں شرطاں منو۔",
    st_sent: "درخواست گھلی گئی", st_confirmed: "مالک نے پکی کیتی", st_completed: "کرایہ پورا ہویا", st_feedback: "رائے جمع ہو گئی", st_declined: "مالک نے انکار کیتا", st_cancelled: "منسوخ",
    mb_title: "میریاں بکنگاں", mb_empty: "ہلے کوئی بکنگ نئیں۔ منڈی توں مشین دی درخواست کرو۔", mb_complete: "کرایہ پورا کرو", mb_feedback: "رائے جمع کرو",
    mb_cancel: "درخواست منسوخ کرو", mb_waiting: "مالک دی تصدیق دی اڈیک اے۔", mb_go_owner: "مالک پورٹل کھولو",
    mb_rate: "ایس کرائے نوں نمبر دیو", mb_comment: "رائے (مرضی نال)", mb_thanks: "شکریہ۔ تہاڈی رائے محفوظ ہو گئی۔", mb_via_ussd: "USSD / ایگری ایجنٹ راہیں بکنگ", mb_via_app: "ایپ راہیں بکنگ",
    ow_title: "مالک پورٹل", ow_sub: "اپنیاں مشیناں، بکنگ درخواستاں تے کمائی سانبھو۔",
    ow_list: "دستیاب مشینری لکھاؤ", ow_requests: "درخواستاں", ow_earn: "کمائی دا اندازہ", ow_my: "لکھی ہوئی مشینری",
    ow_name: "مشین دا ناں تے ماڈل", ow_cat: "قسم", ow_rate: "فی گھنٹہ کرایہ (روپے)", ow_village: "پنڈ / علاقہ", ow_dist: "سروس ایریا توں فاصلہ (کلومیٹر)",
    ow_opterm: "آپریٹر دیاں شرطاں", ow_trterm: "ٹرانسپورٹ دیاں شرطاں", ow_ownername: "مالک دا ناں", ow_spec: "خاص تفصیل (ہارس پاور، اوزار)",
    ow_fuel: "ڈیزل دی شرط پکی اے: ڈرائی رینٹ، ڈیزل کسان دا۔", ow_submit: "منڈی وچ شامل کرو", ow_approve: "منظور", ow_decline: "انکار",
    ow_no_req: "ہن کوئی رکی ہوئی درخواست نئیں۔", ow_pending: "رکی ہوئی", ow_history: "جواب دتا گیا", ow_available: "دستیاب", ow_hidden: "لکی ہوئی", ow_remove: "ہٹاؤ",
    es_machine: "مشین", es_hours: "روزانہ ویہلے گھنٹے", es_days: "سیزن وچ کرائے دے دن", es_util: "اندازاً بکنگ دی شرح",
    es_result: "سیزن دی اندازاً کرایہ کمائی", es_month: "فی سیزن", es_confirmed: "ہن تک پکیاں بکنگاں توں",
    es_note: "6٪ کمیشن (نکے کساناں لئی 4٪) کسان دے بل وچ جڑدا اے، ایس لئی مالک نوں پورا کرایہ ملدا اے۔ ڈیزل شامل نئیں (ڈرائی رینٹ)۔",
    ag_title: "ایگری ایجنٹ نیٹ ورک", ag_sub: "پنڈ دے دکاندار بغیر سمارٹ فون والے کساناں دی مشینری بک کرن وچ مدد کردے نیں۔",
    ag1_t: "ایگری ایجنٹ کون اے؟", ag1_d: "پنڈ دی کریانے یا موبائل لوڈ دی ہٹی، جنہوں بکنگ پوائنٹ وجوں سکھایا جاندا اے۔",
    ag2_t: "اوہ کی کردے نیں؟", ag2_d: "سروس سمجھاندے، کساناں نوں رجسٹر کردے، مشیناں وکھاندے تے بکنگ گھلدے نیں۔",
    ag3_t: "اوہ کیویں کماندے نیں؟", ag3_d: "ہر پوری بکنگ تے صاف کمیشن، اک کھلی پالیسی ہیٹھ۔",
    ag4_t: "ایہہ کیوں ضروری اے", ag4_d: "منہ متھے بھروسہ بندا اے تے کمزور سگنل والے کسان وی شامل ہوندے نیں۔",
    ussd_title: "یو ایس ایس ڈی بکنگ", ussd_demo: "یو ایس ایس ڈی مینو دی جھلک",
    ussd_steps: "ضمیمہ C فلو", ussd_hint: "کی پیڈ یا کی بورڈ ورتو۔ گھلن لئی ساوا بٹن دباؤ۔",
    kh_title: "ایگری شیئر کسان ہیلپر", kh_placeholder: "گھنٹے، خرچ یا مشین بارے پچھو...", kh_send: "گھلو",
    kh_hello: "السلام علیکم! میں کرائے دے گھنٹے، ڈرائی رینٹ خرچ دا اندازہ لا سکدا آں تے مشین چنن وچ مدد کر سکدا آں۔ اردو، انگریزی یا رومن اردو وچ پچھو۔",
    kh_ai: "Claude AI", kh_offline: "اندرلا ہیلپر", kh_thinking: "سوچ رہیا آں...",
    toast_booked: "بکنگ دی درخواست مالک نوں گھل دتی گئی۔", toast_listed: "جمع ہو گئی۔ ایگری شیئر ٹیم دی منظوری توں بعد منڈی وچ آوے گی۔", toast_confirmed: "بکنگ پکی ہو گئی۔", toast_declined: "بکنگ رد ہو گئی۔",
    toast_completed: "کرایہ پورا ہو گیا۔", toast_feedback: "رائے جمع ہو گئی۔", toast_cancelled: "بکنگ دی درخواست منسوخ ہو گئی۔", toast_removed: "لسٹ ہٹا دتی گئی۔",
    sindhi_note: "سندھی اگلی توسیع دا پیش منظر اے۔ پائلٹ پنجابی تے اردو وچ اے۔",
    tr_fee: "ٹرانسپورٹ مرضی دی: {km} کلومیٹر لئی +{fee}",
    bk_offer_toggle: "اپنی قیمت دسو",
    bk_offer_sub: "کرایہ ودھ لگدا اے؟ مالک نوں پیشکش گھلو۔ اوہ من سکدا، جوابی پیشکش دے سکدا یا انکار کر سکدا اے۔",
    bk_offer_rate: "تہاڈی فی گھنٹہ پیشکش (روپے)",
    bk_offer_tr: "تہاڈی ٹرانسپورٹ پیشکش (روپے)",
    bk_offer_note: "مالک لئی سنیہا (مرضی نال)",
    bk_offer_note_ph: "جیویں میں صرف 2 کلومیٹر دور آں، ٹرانسپورٹ گھٹ کر دیو؟",
    bk_offer_min: "پیشکش {min} تے {max} دے وچکار ہووے۔",
    bk_listed: "لکھیا",
    bk_your_offer: "تہاڈی پیشکش",
    bk_send_offer: "قیمت دی پیشکش گھلو",
    st_countered: "مالک دی جوابی پیشکش",
    offer_badge: "قیمت دی پیشکش",
    mb_counter: "مالک نے جوابی پیشکش گھلی:",
    mb_accept_counter: "جوابی پیشکش منو",
    mb_decline_counter: "انکار",
    mb_offer_line: "تہاڈی پیشکش: {rate}/گھنٹہ",
    mb_signin: "اپنیاں بکنگاں ویکھن لئی سائن ان کرو۔",
    ow_offer_from: "کسان دی پیشکش",
    ow_accept_offer: "پیشکش منو",
    ow_counter: "جوابی پیشکش",
    ow_send_counter: "جوابی پیشکش گھلو",
    ow_counter_rate: "تہاڈا فی گھنٹہ کرایہ (روپے)",
    ow_counter_tr: "ٹرانسپورٹ (روپے)",
    ow_note: "سنیہا",
    toast_offer: "قیمت دی پیشکش مالک نوں گھل دتی۔",
    toast_countered: "جوابی پیشکش کسان نوں گھل دتی۔",
    nav_members: "ممبر",
    auth_signin: "سائن ان",
    auth_signup: "سائن اپ",
    auth_signout: "سائن آؤٹ",
    au_title_in: "جی آیاں نوں",
    au_title_up: "اپنا ایگری شیئر اکاؤنٹ بناؤ",
    au_title_reset: "پاس ورڈ ری سیٹ کرو",
    au_sub: "بکنگ، قیمت دی پیشکش تے مشینری لکھان لئی سائن ان کرو۔",
    au_name: "پورا ناں",
    au_email: "ای میل",
    au_phone: "موبائل نمبر",
    au_pass: "پاس ورڈ",
    au_pass2: "پاس ورڈ دوبارہ",
    au_role: "میں آں",
    role_renter: "کسان / کرائے دار",
    role_owner: "مشینری مالک",
    role_agent: "ایگری ایجنٹ",
    au_district: "ضلع",
    au_consent: "میں منظور کردا آں کہ ایگری شیئر میرا ناں، ای میل، موبائل تے ضلع صرف اکاؤنٹ چلان لئی رکھے (سیکشن 12.2)۔",
    au_create: "اکاؤنٹ بناؤ",
    au_login: "سائن ان",
    au_have: "پہلاں اکاؤنٹ اے؟",
    au_new: "ایگری شیئر تے نویں او؟",
    au_forgot: "پاس ورڈ بھل گئے؟",
    au_reset_btn: "نواں پاس ورڈ رکھو",
    au_reset_note: "ایس ای میل نال رجسٹر اکاؤنٹ دا پاس ورڈ تسیں دوبارہ رکھ سکدے او۔",
    au_back: "سائن ان تے واپس",
    au_err_name: "پورا ناں لکھو۔",
    au_err_email: "ٹھیک ای میل لکھو۔",
    au_err_pass: "پاس ورڈ گھٹ توں گھٹ 6 حرفاں دا ہووے۔",
    au_err_pass2: "پاس ورڈ اکو جہے نئیں۔",
    au_err_consent: "مہربانی کر کے پرائیویسی نوٹ منو۔",
    au_err_wrong: "ای میل یا پاس ورڈ غلط اے۔",
    au_err_none: "کوئی اکاؤنٹ نئیں لبھیا۔ پہلاں سائن اپ کرو۔",
    au_err_exists: "ایس لاگ ان توں اکاؤنٹ پہلاں ای موجود اے۔ سائن ان کرو۔",
    au_err_taken: "ایہہ ای میل پہلاں رجسٹر اے۔ سائن ان کرو۔",
    au_err_generic: "کجھ غلط ہو گیا۔ فیر کوشش کرو۔",
    au_need: "اگے ودھن لئی سائن ان کرو یا اکاؤنٹ بناؤ۔",
    au_local_note: "صرف ایس براؤزر وچ محفوظ (سانجھے ریکارڈ ایتھے نئیں)۔",
    toast_welcome: "جی آیاں نوں، {name}!",
    toast_signedout: "تسیں سائن آؤٹ ہو گئے۔",
    toast_registered: "اکاؤنٹ بن گیا۔ ایگری شیئر وچ جی آیاں نوں!",
    toast_reset: "پاس ورڈ بدل گیا۔ سائن ان کرو۔",
    mem_title: "رجسٹر ممبر",
    mem_sub: "ایگری شیئر تے سائن اپ کرن والے سارے لوک، ای میل تے کردار نال۔",
    mem_total: "کل ممبر",
    mem_search: "ناں، ای میل یا ضلع لبھو",
    mem_empty: "ہلے کسے نے رجسٹر نئیں کیتا۔",
    mem_joined: "شامل ہویا",
    mem_last: "آخری سائن ان",
    mem_copy: "CSV کاپی کرو",
    mem_copied: "کاپی ہو گیا",
    mem_cloud: "سدھے سانجھے ریکارڈ۔ ایہہ لسٹ صرف تسیں (مالک) تے ایڈیٹر ویکھ سکدے او۔",
    mem_local: "ریکارڈ صرف ایس براؤزر وچ محفوظ نیں۔",
    mem_loading: "ممبر لوڈ ہو رہے نیں...",
    mem_slow: "ریکارڈ لوڈ ہون وچ ویلا لگ رہیا اے۔",
    nav_admin: "ایڈمن پینل",
    ad_title: "ایڈمن پینل",
    ad_sub: "نویں مشینری دی تصدیق کرو، بکنگاں تے کمیشن ویکھو تے پلیٹ فارم ریٹ رکھو۔",
    ad_lock_title: "ایڈمن رسائی",
    ad_lock_sub: "کنٹرول پینل کھولن لئی ایڈمن پن لکھو۔",
    ad_pin: "پن",
    ad_unlock: "کھولو",
    ad_pin_wrong: "غلط پن۔ فیر کوشش کرو۔",
    ad_lock: "لاک",
    ad_verify: "مشینری دی تصدیق",
    ad_ledger: "بکنگاں تے کمیشن",
    ad_settings: "پلیٹ فارم سیٹنگاں",
    ad_requests: "اپنی بولی درخواستاں",
    ad_pending: "تصدیق دی اڈیک",
    ad_approve: "منظور",
    ad_reject: "رد",
    ad_none: "ہلے کجھ نئیں۔",
    ad_submitted: "جمع",
    ad_kpi_bookings: "کل بکنگاں",
    ad_kpi_gtv: "کل لین دین دی رقم",
    ad_kpi_comm: "کمایا کمیشن",
    ad_kpi_pending: "رکیا کمیشن",
    ad_col_id: "بکنگ",
    ad_col_date: "تاریخ",
    ad_col_machine: "مشین",
    ad_col_renter: "کرائے دار",
    ad_col_channel: "ذریعہ",
    ad_col_status: "حالت",
    ad_col_value: "رقم",
    ad_col_comm: "کمیشن",
    ad_diesel: "قومی ڈیزل ریٹ (روپے فی لیٹر)",
    ad_diesel_sub: "ایہہ ریٹ ساری ایپ وچ درخواست پاؤ (تنے درجے، 100 کلومیٹر سمیت) تے کسان ہیلپر وچ ورتیا جاندا اے۔",
    ad_save: "محفوظ کرو",
    ad_updated: "آخری تبدیلی",
    ad_diesel_preview: "مثال: ہارویسٹر 4 گھنٹے وچ لگ بھگ {l} لیٹر = {v} دا ڈیزل۔",
    ad_districts: "پائلٹ ضلعے",
    ad_districts_sub: "بند ضلعیاں دیاں مشیناں کساناں تے نویاں لسٹاں توں لک جاندیاں نیں۔",
    ad_min_one: "گھٹ توں گھٹ اک ضلع چالو رکھو۔",
    ad_reset: "ڈیمو ڈیٹا ری سیٹ",
    ad_reset_sub: "6 نمونے دیاں مشیناں واپس، بکنگاں تے درخواستاں صاف تے ڈیزل ریٹ ری سیٹ۔",
    ad_reset_confirm: "پکی کرن لئی فیر دباؤ",
    ad_req_rate: "پیشکش",
    ad_req_tier: "اپڑیا درجہ",
    rq_open: "کھلی",
    rq_booked: "بک ہو گئی",
    rq_closed: "بند",
    ls_pending: "تصدیق دی اڈیک",
    ls_approved: "منظور",
    ls_rejected: "رد",
    toast_approved: "لسٹ منظور، ہن منڈی وچ اے۔",
    toast_rejected: "لسٹ رد۔",
    toast_diesel: "ڈیزل ریٹ ساری ایپ وچ {v} فی لیٹر ہو گیا۔",
    toast_demo_reset: "منڈی ڈیٹا ری سیٹ ہو گیا۔",
    lr_diesel_admin: "قومی ڈیزل ریٹ: {v} فی لیٹر",
    lr_recent: "تہاڈیاں تازہ درخواستاں",
    bk_smallholder: "نکا کسان (5 ایکڑ توں گھٹ)",
    bk_smallholder_sub: "عام 6% دی تھاں رعایتی 4% کمیشن۔",
    pay_paylater: "ہن وڈھی، بعد وچ ادائیگی (30% ہن + 70% وڈھی توں بعد)",
    pl_now: "ہن ادائیگی (30%)",
    pl_later: "وڈھی توں بعد (70%)",
    pl_partner: "قرض پارٹنر (تجویز کردہ)",
    pl_due: "70% واپسی دی مدت",
    pl_days: "دن",
    pl_due_on: "آخری تاریخ",
    pl_now_short: "ہن",
    pl_risk: "70% رقم تیجی دھر مائیکروفنانس پارٹنر دا قرض اے، واپسی دا خطرہ پارٹنر دا۔ ایگری شیئر تے کوئی قرض خطرہ نئیں۔ پارٹنراں دے ناں صرف تجویز نیں (کوئی معاہدہ نئیں) تے پارٹنر فیس لگ سکدی اے۔",
    pl_settled: "ادا ہو گیا",
    pl_pending: "70% باقی",
    pl_settled_by: "ایگری منڈی ویچ {id} توں آپے ادا ہویا۔",
    pl_settle_mandi: "ایگری منڈی تے فصل ویچ کے ادا کرو",
    kp_title: "سمارٹ فون نئیں؟ سادے فون نال بکنگ کرو",
    kp_sub: "کسے وی سادے فون توں ٹول فری ہیلپ لائن تے کال کرو یا USSD کوڈ ملاؤ۔ پنجابی یا اردو آواز قدم قدم رہنمائی کردی اے تے بکنگ دی تصدیق SMS تے آندی اے۔",
    kp_toll: "ٹول فری ہیلپ لائن",
    kp_ussd: "USSD کوڈ",
    kp_demo: "کسے وی موبائل نیٹ ورک توں مفت۔",
    kp_ivr: "IVR آواز دے قدم",
    kp_try: "کی پیڈ بکنگ ورت کے ویکھو",
    nav_mandi: "ایگری منڈی",
    am_title: "ایگری منڈی: اپنی فصل ویچو",
    am_sub: "اپنی فصل تے قیمت پاؤ۔ رجسٹر آٹا ملاں، رائس ملاں تے وڈے خریدار تہاڈی قیمت تے لائیو بولی لاندے نیں۔ سب توں چنگی پیشکش چنو۔",
    am_credit: "تہاڈا باقی مشینری قرض (70%)",
    am_credit_n: "بکنگاں ہن وڈھی، بعد وچ ادائیگی تے",
    am_closed_loop: "کلوزڈ لوپ ادائیگی",
    am_closed_title: "تہاڈی فصل دی ویچ نال مشینری دا قرض آپے ادا",
    am_loop1: "صرف 30% پیشگی دے کے مشین کرائے تے لوو",
    am_loop2: "اپنی فصل وڈھو",
    am_loop3: "ایگری منڈی تے تصدیق شدہ خریدار نوں ویچو",
    am_loop4: "باقی 70% پارٹنر نوں تے خالص منافع تہاڈے جاز کیش یا ایزی پیسہ وچ",
    am_crop: "فصل",
    crop_wheat: "کنک",
    crop_rice: "چول",
    crop_maize: "مکئی",
    crop_cotton: "کپاہ",
    am_qty: "مقدار (من، 40 کلو)",
    am_grade: "معیار",
    am_grade_a: "درجہ A (صاف، سکی)",
    am_grade_b: "درجہ B",
    am_rate: "تہاڈی متوقع قیمت (روپے فی من)",
    am_bench_src: "منڈی رہنمائی: لگ بھگ {r} فی من (تازہ پنجاب منڈی رپورٹاں توں)۔",
    am_bench_est: "منڈی رہنمائی: لگ بھگ {r} فی من (اندازاً)۔",
    am_expected_total: "متوقع کل رقم",
    am_wallet: "ادائیگی وصول کرو",
    am_wallet_no: "والٹ موبائل نمبر",
    am_post: "فصل پاؤ تے بولیاں لوو",
    am_new: "نویں ویچ پوسٹ",
    am_recent: "تہاڈیاں تازہ فصل پوسٹاں",
    am_mann: "من",
    am_st_open: "کھلی",
    am_st_sold: "وک گئی",
    am_st_closed: "بند",
    am_bids: "خریداراں دیاں لائیو بولیاں",
    am_waiting: "خریدار بولی لا رہے نیں...",
    am_bids_n: "بولیاں",
    am_idle: "ملاں تے وڈے خریداراں توں بولیاں لین لئی فصل پاؤ۔",
    am_no_bids: "کوئی خریدار تہاڈی قیمت تے نئیں آیا۔ تھوڑی گھٹ قیمت یا نویں پوسٹ ازماؤ۔",
    am_type_flour: "آٹا مل",
    am_type_rice: "رائس مل",
    am_type_feed: "فیڈ / نشاستہ مل",
    am_type_ginning: "جننگ فیکٹری",
    am_type_bulk: "وڈا خریدار",
    am_sample: "نمونہ خریدار",
    am_above: "تہاڈی قیمت توں ودھ بولی",
    am_pickup: "خریدار پیلی توں چکے گا",
    am_settlement: "ادائیگی دا جائزہ",
    am_gross: "فصل دی ویچ",
    am_minus_credit: "مشینری قرض دی واپسی (70%)",
    am_unsettled: "{v} قرض باقی رہوے گا کیونکہ ایہہ ویچ پورا نئیں کردی۔",
    am_net: "تہاڈا خالص منافع",
    am_to_wallet: "خریدار دی ادائیگی مگروں رقم تہاڈے {w} {n} وچ۔",
    am_confirm: "ویچ پکی کرو",
    am_done: "ویچ پکی تے ادائیگی پوری۔",
    am_sold_to: "خریدار",
    am_demo_note: "ایگری شیئر ہر ادائیگی دا ریکارڈ رکھدا اے۔",
    toast_sold: "ویچ پکی۔ {net} خالص منافع تہاڈے والٹ وچ۔",
    ad_kpi_credit: "باقی وڈھی قرض (پارٹنر دا)",
    kh_short: "کسان ہیلپر",
    kp_ivr_pa: "پنجابی IVR",
    kp_ivr_ur: "اردو IVR",
    ab_name: "اپنی بولی (اپنا ریٹ دسو)",
    ab_tag: "اپنا کرایہ دسو، نیڑے دے مالک آفر گھلن گے",
    zs_title: "ایگری شیئر مددگار سروس تے پارٹنر نیٹ ورک",
    zs_sub: "{place} دے نیڑے ہلے {machine} دا کوئی رجسٹر مالک آن لائن نئیں۔ فیر وی تہاڈا کم ہو جاوے گا۔ اک رستہ چنو:",
    zs_a: "لبھن دا گھیرا 100 کلومیٹر تک ودھاؤ",
    zs_a_d: "اپنی درخواست نیڑے دیاں تحصیلاں تے ضلعیاں دے تصدیق شدہ مالکاں تک گھلو۔ ٹرانسپورٹ تے ڈیزل دا خرچہ پہلاں ای وکھایا گیا اے:",
    zs_a_btn: "100 کلومیٹر تک گھلو",
    zs_a_done: "لبھائی پہلاں ای 100 کلومیٹر تک ہو رہی اے۔",
    zs_km: "{km} کلومیٹر دور",
    zs_transport: "ٹرانسپورٹ",
    zs_fuel: "ڈیزل",
    zs_total: "اندازاً کُل",
    zs_b: "پنڈ دا ایگری ایجنٹ تے مقامی پارٹنر",
    zs_b_d: "اپنی درخواست ساڈے مقامی ایگری ایجنٹ تے پارٹنر رینٹل نیٹ ورک نوں گھلو۔ ساڈی ٹیم پنڈ دے ٹریکٹر مالکاں نال گل کر کے 2 توں 4 گھنٹیاں وچ SMS یا کال نال تصدیق کرے گی۔",
    zs_b_btn: "ایگری ایجنٹ ٹیم نوں گھلو",
    zs_b_done: "ٹکٹ {id}: ایگری ایجنٹ 2 توں 4 گھنٹیاں وچ {phone} تے کال کرے گا۔",
    zs_c: "مینوں دسو تے رعایت لؤ",
    zs_c_d: "اسیں تہاڈی درخواست سانبھ لواں گے۔ جیویں ای {district} وچ کوئی مالک رجسٹر ہووے گا، اوہ تہانوں اڈیکدے کسان وجوں ویکھے گا تے تہانوں اوس بکنگ تے پلیٹ فارم فیس وچ {pct}٪ رعایت ملے گی۔",
    zs_c_btn: "مینوں دسو",
    zs_c_done: "محفوظ ہو گیا ({id})۔ {district} وچ مالک رجسٹر ہوندیاں ای اسیں تہانوں دساں گے۔",
    zs_phone: "کال بیک لئی فون نمبر",
    zs_machine: "لوڑیندی مشین",
    ow_ownerphone: "مالک دا فون (کال تے واٹس ایپ)",
    ow_waiting: "تہاڈے ضلعے وچ اڈیکدے کسان",
    ow_waiting_sub: "جدوں ایتھے کوئی مالک رجسٹر نئیں سی اودوں سانبھیاں گئیاں اصل درخواستاں۔ ملدی مشین لسٹ کرو تے پہلاں اوہناں نال رابطہ کرو۔",
    ow_waiting_none: "ہلے کوئی کسان اڈیک وچ نئیں۔",
    ow_waiting_list: "ملدی مشین لسٹ کرو",
    toast_waiting: "{district} وچ {n} کسان پہلاں توں {machine} دی اڈیک وچ نیں۔",
    lr_listed: "پکا ریٹ · مالک تصدیق کرے گا",
    lr_step_locked: "مشین یا ریٹ بدلن لئی نویں درخواست شروع کرو۔",
    toast_lr_sent: "درخواست {owner} نوں گھل دتی۔ اوہ اپنے اونر پورٹل توں تصدیق کرن گے۔",
    mode_badge_live: "لائیو · صرف تصدیق شدہ مالک",
    mode_badge_demo: "نمونہ ڈیٹا آن",
    au_err_provider: "فائر بیس وچ ای میل/پاس ورڈ لاگ اِن بند اے۔ فائر بیس کنسول وچ Authentication > Sign-in method توں چالو کرو۔",
    au_err_network: "فائر بیس نال رابطہ نئیں ہویا۔ انٹرنیٹ ویکھ کے فیر کوشش کرو۔",
    au_err_admin_local: "ایڈمن اکاؤنٹ فائر بیس اکاؤنٹ ہونا چاہیدا اے۔ جے \"غلط پاس ورڈ\" آوے تے اک واری سائن اپ کرو۔",
    ad403_title: "403 — صرف مجاز ایگری شیئر انتظامیہ",
    ad403_sub: "ایہ حصہ صرف ایگری شیئر دے بانی تے مجاز ٹیم ایڈمناں لئی اے۔",
    ad403_signin: "ایڈمن اکاؤنٹ نال سائن اِن کرو",
    ad403_home: "منڈی تے واپس جاؤ",
    ad403_local: "تسیں {email} نال اجیہے اکاؤنٹ وچ سائن اِن او جو صرف ایس براؤزر وچ اے، فائر بیس وچ نئیں۔ ایڈمن لئی فائر بیس اکاؤنٹ ضروری اے۔",
    ad403_phone: "تسیں فون نمبر نال سائن اِن او۔ ایڈمن لئی بانی دا ای میل اکاؤنٹ ضروری اے۔",
    ad403_other: "تسیں {email} نال سائن اِن او، جو مجاز ایڈمن ای میل نئیں۔",
    ad403_fix: "سائن آؤٹ کر کے فائر بیس نال سائن اِن کرو",
    dm_agent_dispatch: "ایگری ایجنٹ روانگی",
    dm_notify: "مینوں دسو",
    vc_no_speech: "کوئی آواز نئیں سنی — فیر کوشش لئی مائیک دباؤ۔",
    vc_again: "دوبارہ بولن لئی دباؤ",
    vc_replay: "سنو"
  },
  sd: {
    vc_mic_blocked: "مائيڪ جي اجازت نه ملي۔ برائوزر جي سيٽنگن ۾ مائيڪ جي اجازت ڏيو، پوءِ ٻيهر ڳالهائڻ لاءِ دٻايو۔",
    vc_demo_btn: "مثال ٻڌو",
    vc_retry: "مائیک دوبارہ آزمائیں",
    vc_no_mic: "مائيڪ نه مليو۔ مائيڪ لڳايو، پوءِ ٻيهر ڳالهائڻ لاءِ دٻايو۔",
    vc_net: "آواز سڃاڻڻ لاءِ انٽرنيٽ گهرجي۔ ڪنيڪشن ڏسو، پوءِ ٻيهر ڳالهائڻ لاءِ دٻايو۔",
    vc_lang_unsupported: "هي برائوزر هن ٻولي ۾ ٻڌي نٿو سگهي۔ ڪروم استعمال ڪريو يا 'مثال ٻڌو' دٻايو۔",
    vc_no_voice: "هن ڊوائيس تي اردو آواز ناهي، تنهنڪري جواب رومن اردو ۾ پڙهيا پيا وڃن۔ اردو ٻڌڻ لاءِ اردو آواز انسٽال ڪريو (اينڊرائيڊ: سيٽنگز > ٽيڪسٽ ٽو اسپيچ)۔",
    nav_activity: "سرگرمی",
    nav_s_market: "مارکیٹ",
    nav_s_live: "درخواست",
    nav_s_mandi: "فصل بیچیں",
    nav_s_bookings: "بکنگ",
    nav_s_owner: "مالک",
    nav_s_agent: "ایجنٹ",
    nav_s_more: "مزید",
    hero_role_farmer: "کسان",
    hero_need: "مشین چاہیے؟",
    hero_role_owner: "مالک",
    hero_earn: "اپنی مشین سے کمائیں",
    hero_live: "ایگری شیئر پر لائیو",
    hero_machines: "اس خطے میں درج مشینیں",
    hero_owners: "مالکان",
    hero_bookings: "اس ڈیوائس پر بکنگز",
    tr1_t: "تصدیق شدہ مالکان",
    tr1_s: "ہر لسٹنگ لائیو ہونے سے پہلے ایگری شیئر ٹیم جانچتی ہے",
    tr2_t: "4% سے 6% منصفانہ کمیشن",
    tr2_s: "5 ایکڑ سے کم والے کسانوں کے لیے صرف 4%",
    tr3_t: "30/70 فصل کریڈٹ",
    tr3_s: "ابھی 30%، فصل کے بعد 70% (مجوزہ پارٹنرز)",
    tr4_t: "24/7 ہیلپ لائن اور آواز",
    tr4_s: "ٽول فري يو اي اين ۽ ڪسان هيلپر وائس اسسٽنٽ",
    ov_dry: "ڈرائی رینٹ",
    ov_op: "آپریٹر شامل",
    toast_broadcast_t: "درخواست بھیج دی گئی",
    toast_broadcast: "{n} قریبی مالکان کو بھیجی گئی۔ کوئی قبول نہ کرے تو دائرہ خود بڑھے گا۔",
    toast_broadcast0: "قریبی مالکان تلاش ہو رہے ہیں۔ دائرہ خود بڑھے گا۔",
    toast_booked_t: "بکنگ ہو گئی",
    toast_offer_t: "پیشکش بھیج دی",
    toast_synced: "کلاؤڈ پر محفوظ۔",
    toast_local: "اس ڈیوائس پر محفوظ۔",
    act_title: "میری سرگرمی",
    act_sub: "بکنگ، لائیو درخواستیں اور ایگری مارکیٹ سودے ایک جگہ",
    act_bookings: "بکنگ",
    act_requests: "درخواستیں",
    act_deals: "سودے",
    act_voucher: "واؤچر",
    act_view_voucher: "واؤچر دیکھیں",
    act_empty_b: "ابھی کوئی بکنگ نہیں۔",
    act_empty_r: "ابھی کوئی لائیو درخواست نہیں۔",
    act_empty_d: "ابھی کوئی فصل پوسٹ نہیں۔",
    act_all: "مکمل بکنگ صفحہ کھولیں",
    act_sold: "فروخت",
    act_open: "کھلی",
    vo_title: "ڈیجیٹل بکنگ واؤچر",
    vo_ref: "حوالہ",
    vo_issued: "جاری",
    vo_verified: "بکنگ ایگری شیئر پر درج ہے",
    vo_cancelled: "یہ بکنگ منسوخ یا مسترد ہو گئی",
    vo_track: "لائیو اسٹیٹس",
    vo_s1: "مالک نے تصدیق کی",
    vo_s2: "مشین راستے میں",
    vo_s3: "کام مکمل",
    vo_waiting: "مالک کی تصدیق کا انتظار ہے۔",
    vo_mark_route: "مالڪ: مشين رستي ۾ آهي",
    vo_machine: "مشین",
    vo_date: "تاریخ اور گھنٹے",
    vo_location: "ضلع",
    vo_renter: "کسان",
    vo_items: "خرچ کی تفصیل",
    vo_total: "کل رقم",
    vo_fuel: "ڈیزل کا اندازہ",
    vo_print: "پرنٹ / PDF",
    vo_download: "ڈاؤن لوڈ",
    vo_close: "بند کریں",
    vo_note: "یہ بکنگ آئی ڈی مالک یا اپنے ایگری ایجنٹ کو دکھائیں۔",
    vo_pattern_note: "مشين ڏيندي هي بيج ۽ بڪنگ نمبر مالڪ کي ڏيکاريو۔",
    lr_diesel_note_intl: "هن علائقي ۾ ڊيزل جي عام قيمت۔ ڊرائي رينٽ ۾ ڊيزل هاري پاڻ خريد ڪري ٿو۔",
    country: "ملڪ / علائقو",
    country_PK: "پاکستان",
    country_CN: "چین",
    country_IN: "بھارت",
    country_US: "امریکہ / یورپ",
    country_ME: "مشرق وسطیٰ / افریقہ",
    fx_note: "قيمتون مقامي ڪرنسي ۾ حوالي جي اگهه تي (1 ڊالر ≈ 278 رپيا ≈ 6.67 يوآن ≈ 94 ڀارتي رپيا)۔ علائقائي اگهه مارڪيٽ جا اندازا آهن۔",
    one_leveler: "لیزر لینڈ لیولر",
    one_planter: "سیڈ ڈرل / پلانٹر",
    one_drone: "اسپرے ڈرون",
    one_implement: "آلات / پمپ",
    cat_leveler: "لیولر",
    cat_planter: "پلانٹر",
    cat_drone: "ڈرون",
    cat_implement: "آلات",
    lr_steps: "درخواست کے مراحل",
    lr_step1: "مشین کی قسم",
    lr_step2: "مقام اور پیشکش",
    lr_step3: "لائیو آفرز",
    lr_choose: "توهان کي ڪهڙي مشين گهرجي؟",
    lr_choose_sub: "پهريان مشين جو قسم چونڊيو، پوءِ پنهنجو اگهه ٻڌايو۔ {country} جا ماڊل ۽ اگهه۔",
    cat_rates_note: "عام مارڪيٽ اگهه، پڪي قيمت ناهي۔",
    lr_est_rate: "اندازاً فی گھنٹہ ریٹ",
    lr_select: "چونڊيو ۽ اڳتي وڌو",
    lr_selected: "منتخب",
    lr_change_machine: "بدلايو",
    lr_pref_model: "پسندیدہ ماڈل (اختیاری)",
    lr_any_model: "ڪوبه ماڊل",
    lr_diesel_intl: "مقامي ڊيزل قيمت: {v}/ليٽر",
    lr_fuel_battery: "بیٹری سے چلتا ہے: ڈیزل کی ضرورت نہیں۔",
    ow_suggest: "{country} کے تجویز کردہ ماڈل (نام، تفصیل اور ریٹ بھرنے کے لیے دبائیں)",
    loc_sub_intl: "علاقہ چنیں، گاؤں یا فارم لکھیں، یا GPS استعمال کریں۔",
    loc_regions: "زرعی علاقے",
    loc_map_pk_only: "انٹرایکٹو نقشہ صرف پاکستان کا ہے۔ دوسرے ممالک میں قریبی علاقہ چنیں، گاؤں لکھیں یا درست پن کے لیے GPS استعمال کریں۔",
    lr_tier1_t_intl: "مفت یا کم مقامی ٹرانسپورٹ",
    lr_tier2_t_intl: "درمیانی ٹرانسپورٹ، فی کلومیٹر ہر طرف",
    op_optional_intl: "آپریٹر (ڈرائیور) اختیاری، اضافی فی گھنٹہ خرچ",
    tr_optional_intl: "ٹرانسپورٹ اختیاری (فی کلومیٹر، کم از کم خرچ کے ساتھ)",
    au_method: "سائن ان کا طریقہ",
    au_m_email: "ای میل",
    au_m_phone: "فون OTP",
    au_phone_hint: "پاکستانی موبائل، مثلاً 0300 1234567۔ آپ کو 6 ہندسوں کا کوڈ بھیجا جائے گا۔",
    au_otp: "کوڈ {phone} پر بھیجا گیا",
    au_otp_err: "6 ہندسوں کا کوڈ لکھیں۔",
    au_otp_send: "ڪوڊ موڪليو",
    au_otp_verify: "تصدیق کریں اور آگے بڑھیں",
    au_otp_resend: "نمبر بدلیں یا دوبارہ کوڈ بھیجیں",
    au_otp_wrong: "کوڈ غلط ہے یا ختم ہو گیا۔ دوبارہ کوشش کریں۔",
    au_otp_limit: "بہت زیادہ کوششیں۔ چند منٹ انتظار کریں یا ای میل استعمال کریں۔",
    au_phone_off: "فون سائن ان ابھی دستیاب نہیں (Firebase صرف Blaze پلان پر SMS بھیجتا ہے)۔ ای میل استعمال کریں۔",
    role_buyer: "فصل خريدار",
    cloud_live: "لائیو: Firestore سنک آن",
    cloud_connecting: "Firestore سے رابطہ ہو رہا ہے…",
    cloud_partial: "جزوی سنک: بکنگ سنک کرنے کے لیے سائن ان کریں",
    cloud_offline: "آف لائن: اس ڈیوائس پر محفوظ",
    cloud_local: "صرف هن ڊوائيس تي محفوظ",
    au_reset_email_note: "نئون پاس ورڊ رکڻ جي لنڪ توهان جي اي ميل تي موڪلي ويندي.",
    toast_reset_link: "پاس ورڈ ری سیٹ لنک بھیج دیا گیا۔ اپنی ای میل (اور اسپام) دیکھیں۔",
    loc_nearest_beyond: "توهان جي دائري کان ٻاهر ويجھيون مشينون (ٽرانسپورٽ مهانگي):",
    loc_title: "پنهنجي جاءِ چونڊيو",
    loc_sub: "پاکستان میں کہیں بھی: صوبہ اور ضلع چنیں، گاؤں لکھیں، نقشے پر پن لگائیں یا GPS استعمال کریں۔",
    loc_province: "صوبہ / علاقہ",
    loc_district: "ضلعو",
    loc_district_ph: "کوئی بھی ضلع تلاش کریں، مثلاً لاڑکانہ، سوات، تربت",
    loc_village: "ڳوٺ / چڪ / تعلقو",
    loc_village_ph: "مثلاً چک 45 گ ب، تحصیل جڑانوالہ",
    loc_gps: "منهنجي موجوده GPS جاءِ استعمال ڪريو",
    loc_gps_wait: "آپ کا مقام تلاش ہو رہا ہے…",
    loc_gps_denied: "مقام کی اجازت بند ہے۔ نقشے پر پن لگائیں۔",
    loc_gps_unsupported: "یہ براؤزر GPS نہیں دے سکتا۔ نقشے پر پن لگائیں۔",
    loc_gps_outside: "آپ کا GPS مقام پاکستان سے باہر ہے۔ نقشے پر پن لگائیں۔",
    loc_map_hint: "پن لگانے کے لیے نقشے پر ٹیپ کریں۔ ضلع چننے کے لیے نقطے پر ٹیپ کریں۔",
    loc_pin: "پن لگ گیا",
    loc_none: "ابھی پن نہیں",
    loc_nearest: "قریبی ضلع",
    loc_save: "جاءِ محفوظ ڪريو",
    loc_clear: "صاف کریں",
    loc_change: "تبدیل کریں",
    loc_set: "مقام لگائیں",
    loc_fit: "پورا پاکستان دکھائیں",
    loc_err: "مهرباني ڪري پنهنجي جاءِ ڏيو.",
    loc_your: "توهان جي زمين جي جاءِ",
    loc_road: "سڑک کا اندازہ",
    loc_far: "{place} جي {km} ڪلوميٽرن اندر اڃا ڪا مشين ناهي۔ دائرو وڌايو يا درخواست موڪليو۔",
    loc_try_live: "لائیو درخواست بھیجیں",
    loc_dist_note: "فاصلے آپ کے پن سے سڑک کا اندازہ ہیں۔",
    loc_dist_hint: "درست فاصلہ اور ٹرانسپورٹ خرچ دیکھنے کے لیے اپنا مقام لگائیں۔",
    loc_machine: "مشين ڪٿي رکيل آهي؟",
    loc_farm: "زمين جي جاءِ",
    f_province: "صوبہ",
    all_provinces: "تمام صوبے",
    ad_provinces: "فعال صوبے",
    ad_provinces_sub: "ان صوبوں سے باہر کی لسٹنگ مارکیٹ میں نہیں دکھائی جاتی۔",
    ad_min_one_prov: "کم از کم ایک صوبہ فعال رکھیں۔",
    vc_title: "لائيو آواز ڪال",
    vc_start: "آواز ڪال شروع ڪريو",
    vc_end: "آواز ڪال ختم ڪريو",
    vc_ready: "تيار",
    vc_listening: "ٻڌي رهيو آهيان… ڳالهايو",
    vc_thinking: "سمجهي رهيو آهيان…",
    vc_speaking: "ڳالهائي رهيو آهيان…",
    vc_tap: "مائيڪ دٻايو ۽ ڳالهايو",
    vc_tap_btn: "ڳالهائڻ لاءِ دٻايو",
    vc_done_speaking: "بات مکمل",
    vc_demo: "مثال",
    vc_you_said: "توهان چيو",
    vc_mute: "آواز بند",
    vc_unmute: "آواز کوليو",
    vc_mic_error: "مائيڪ شروع نه ٿيو۔ ٻيهر ڪوشش ڪريو يا مثال هلايو۔",
    vc_unsupported: "هن برائوزر ۾ آواز سان ڳالهه ممڪن ناهي۔ اينڊرائيڊ يا ڪمپيوٽر تي ڪروم يا ايج استعمال ڪريو، يا سوال لکو۔",
    vc_tts_off: "آواز میں جواب بند ہیں۔ جواب متن میں نظر آئیں گے۔",
    vc_engine_claude: "Claude کی آواز۔ ہر بار بولنے کے لیے دبائیں۔",
    vc_engine_browser: "براؤزر کی آواز۔ ہر جواب کے بعد خود دوبارہ سنتا ہے۔",
    vc_lang_note: "اس زبان کے لیے آواز اردو میں سنی اور پڑھی جاتی ہے۔",
    nav_live: "درخواست موڪليو",
    cta_live: "درخواست موڪليو (پنهنجي ٻولي)",
    lr_title: "پنهنجي ٻولي: مشينري لاءِ پنهنجو اگهه ٻڌايو",
    lr_sub: "پنهنجي قيمت پاڻ ٻڌايو۔ ويجها مالڪ ريڊار تي توهان جي درخواست ڏسي قبول ڪن ٿا يا جوابي آڇ موڪلين ٿا۔ ويجهو ڪو واندو نه هجي ته دائرو وڌايو۔",
    lr_machine: "گهربل مشين",
    lr_village: "توهان جو ڳوٺ / جڳهه",
    lr_hours: "گهربل ڪلاڪ",
    lr_date: "تاريخ",
    lr_rate: "توهان جي آڇ (رپيا في ڪلاڪ)",
    lr_rate_hint: "ويجهو عام اگهه: {r} في ڪلاڪ",
    lr_rent: "ڪرائي جو قسم",
    lr_dry: "ڊرائي رينٽ",
    lr_dry_d: "ڊيزل توهان جو",
    lr_wet: "ويٽ رينٽ",
    lr_wet_d: "ڊيزل مالڪ جو، مارڪيٽ اگهه تي",
    lr_diesel: "ڊيزل اگهه (رپيا في ليٽر)",
    lr_diesel_note: "ايگري شيئر ٽيم جو مقرر ڪيل مارڪيٽ اگهه۔ پاڪستان ۾ ڊيزل جي قيمت اڪثر بدلجي ٿي۔",
    lr_peak: "لابارن جي مصروف مند",
    lr_peak_d: "ڳوٺ ۽ پائلٽ علائقي جون مشينون مصروف آهن، تنهن ڪري ڳولا ٽئين درجي تائين ويندي۔",
    lr_post: "درخواست موڪليو ۽ مالڪ ڳوليو",
    lr_new: "نئين درخواست",
    lr_radar: "لائيو ريڊار",
    lr_compare: "ٽنهي دائرن جو ڀيٽ",
    lr_idle: "ڳولا شروع ڪرڻ لاءِ درخواست موڪليو۔",
    lr_scanning: "{tier} ۾ ڳولا جاري...",
    lr_offers_count: "لائيو آڇون",
    lr_offers: "مالڪن جون لائيو آڇون",
    lr_idle_offers: "مالڪن جون آڇون هتي فوراً اينديون۔",
    lr_waiting: "مالڪن جي جواب جو انتظار...",
    lr_no_match: "{tier} ۾ ڪا مشين نه ملي۔",
    lr_expand: "ڳولا {tier} تائين وڌايو",
    lr_raise: "آڇ وڌايو يا تاريخ بدلايو۔",
    lr_eta: "پهچڻ جو وقت",
    lr_accepts: "توهان جو اگهه منظور",
    lr_counter: "جوابي آڇ",
    lr_grand: "ڪل رقم",
    lr_free: "مفت",
    lr_accept: "قبول",
    lr_decline: "انڪار",
    lr_confirm: "بڪنگ پڪي ڪريو",
    lr_confirmed: "بڪنگ ٿي وئي! منهنجون بڪنگون ۾ ڏسو۔",
    lr_compare_sub: "ساڳي درخواست، هر درجي جو ويجهو مالڪ۔ هڪ ڪلڪ سان اهو درجو ريڊار تي ٻيهر اسڪين ٿيندو۔",
    lr_nearest: "ويجهو مالڪ",
    lr_base: "مشين جو بنيادي ڪرايو",
    lr_test_tier: "هي درجو اسڪين ڪريو",
    lr_compare_hint: "پهريان درخواست موڪليو، پوءِ انهن بٽڻن سان هر دائري جو ڀيٽ ڪريو۔",
    lr_legend_offer: "آڇ آئي",
    lr_legend_scan: "دائري ۾ مالڪ",
    lr_legend_busy: "مصروف",
    lr_you: "توهان",
    lr_alert3: "پري جي بڪنگ: ٽرانسپورٽ ۽ ڊيزل جو خرچ وڌيڪ آهي۔ پڪي ڪرڻ کان اڳ پورو خرچ ڏسو۔",
    lr_breakdown: "خرچ جي پوري تفصيل",
    lr_transport_local: "مقامي ٽرانسپورٽ",
    lr_transport: "ٽرانسپورٽ ({km} ڪلوميٽر × 2 پاسا × {rate} رپيا)",
    lr_fuel_wet: "ڊيزل (ويٽ رينٽ، مالڪ جو بل)",
    lr_platform_bill: "ايگري شيئر ذريعي ادائيگي",
    lr_fuel_dry: "توهان جو پنهنجو ڊيزل (ڊرائي رينٽ، پمپ تي)",
    lr_fuel_est: "ڊيزل جو اندازو: في ڪلاڪ {l} ليٽر، موجوده مارڪيٽ قيمت تي۔",
    lr_tier1: "درجو 1: ڳوٺ جو علائقو",
    lr_tier1_r: "1 کان 5 ڪلوميٽر",
    lr_tier1_t: "مفت يا گهٽ مقامي ٽرانسپورٽ (0 کان 500 رپيا)",
    lr_tier2: "درجو 2: پائلٽ علائقو",
    lr_tier2_r: "15 کان 25 ڪلوميٽر",
    lr_tier2_t: "وچولي ٽرانسپورٽ، 60 رپيا في ڪلوميٽر هر پاسي",
    lr_tier3: "درجو 3: علائقائي بيڪ اپ",
    lr_tier3_r: "100 ڪلوميٽر تائين",
    lr_tier3_t: "لابارو رش ۾ هنگامي سهولت، ڊگهي ٽرانسپورٽ",
    toast_lr_booked: "{owner} سان بڪنگ پڪي۔",
    mb_via_live: "پنهنجي ٻولي ذريعي بڪنگ",
    ow_no_history: "اڃا ڪو جواب ناهي۔",
    nav_market: "مشينري بازار", nav_bookings: "منهنجون بڪنگون", nav_owner: "مالڪ پورٽل", nav_agent: "ايگري ايجنٽ ۽ USSD",
    tagline: "وسيلا ورهايو، گڏجي وڌو",
    hero_kicker: "پنجاب پائلٽ · ٽريڪٽر · ٿريشر · هارويسٽر",
    hero_title: "مشين خريد ڪرڻ ضروري ناهي، ڪرائي تي وٺو۔",
    hero_owner: "توهان جي واندي مشينري ڪرائي سان ڪمائي سگهي ٿي۔",
    hero_desc: "پنهنجي ڳوٺ ويجهو ٽريڪٽر، ٿريشر ۽ هارويسٽر ڳوليو، بڪنگ کان اڳ پورو ڊرائي رينٽ اگهه ڏسو ۽ ڪجهه منٽن ۾ درخواست موڪليو۔",
    cta_find: "مشينري ڳوليو", cta_list: "پنهنجي مشين لکرايو",
    stat_pilot: "پنجاب پائلٽ علائقا", stat_radius: "ڪلوميٽر ايپ ڳولا", stat_comm: "پليٽ فارم ڪميشن", stat_cats: "مشينن جا قسم",
    how_title: "ايگري شيئر ڪيئن ڪم ڪري ٿو",
    how1: "مالڪ واندي مشين لکرائي ٿو", how2: "هاري 15 ڪلوميٽر ۾ ڳولي ٿو", how3: "پورو ڊرائي رينٽ اگهه ڏسي ٿو", how4: "مالڪ تصديق ڪري ٿو، ڪم ٿئي ٿو",
    filters: "فلٽر", f_category: "مشين جو قسم", cat_all: "سڀ", cat_tractor: "ٽريڪٽر", cat_thresher: "ٿريشر", cat_harvester: "هارويسٽر",
    one_tractor: "ٽريڪٽر", one_thresher: "ٿريشر", one_harvester: "هارويسٽر",
    f_district: "پنجاب جو ضلعو", all_districts: "سڀ ضلعا", f_radius: "ڳولا جو دائرو", f_search: "مشين يا ڳوٺ ڳوليو",
    km: "ڪلوميٽر", radius_note: "ڊيفالٽ 15 ڪلوميٽر، وڌ ۾ وڌ 25 ڪلوميٽر",
    results: "{n} مشينون مليون", no_results: "انهن فلٽرن سان ڪا مشين نه ملي۔ دائرو وڌايو يا سڀ ضلعا چونڊيو۔", reset: "فلٽر ري سيٽ ڪريو",
    per_hour: "/ڪلاڪ", rate_label: "في ڪلاڪ اگهه", distance: "پري", dry_rent: "ڊرائي رينٽ: ڊيزل شامل ناهي",
    op_included: "آپريٽر (ڊرائيور) ڪرائي ۾ شامل", op_optional: "آپريٽر (ڊرائيور) اختياري: +500 رپيا/ڪلاڪ", op_none: "آپريٽر ناهي: پنهنجو ڊرائيور آڻيو",
    tr_included: "ٽرانسپورٽ شامل", tr_optional: "ٽرانسپورٽ اختياري (100 رپيا في ڪلوميٽر، گهٽ ۾ گهٽ 500)", tr_self: "ٽرانسپورٽ هاريءَ جي ذميواري",
    request: "بڪنگ جي درخواست", unavailable: "هن وقت موجود ناهي", owner: "مالڪ", new_badge: "نئين لسٽ",
    bk_title: "بڪنگ جي درخواست", bk_date: "ڪرائي جي تاريخ", bk_hours: "ڪم جا ڪلاڪ", bk_operator: "آپريٽر شامل ڪريو", bk_transport: "ٽرانسپورٽ شامل ڪريو",
    bk_breakdown: "اگهه جي صاف تفصيل", bk_base: "بنيادي ڊرائي رينٽ", bk_op: "آپريٽر", bk_tr: "ٽرانسپورٽ", bk_sub: "ذيلي ڪل",
    bk_comm: "پليٽ فارم ڪميشن ({p})", bk_total: "ڪل اندازي رقم", bk_fuel_line: "ڊيزل: هاري ڏيندو (اگهه ۾ شامل ناهي)",
    bk_ack: "مان سمجهان ٿو/ٿي ته هي ڊرائي رينٽ آهي: ڊيزل مان ڏيندس، ۽ اوور ٽائيم ۽ دير سان واپسي جون شرطون تصديق کان اڳ مالڪ سان طئي ٿينديون۔",
    bk_pay: "ادائيگيءَ جو طريقو", bk_pay_note: "ايزي پيسا، جاز ڪيش يا پنهنجي ايگري ايجنٽ ذريعي نقد ادا ڪريو۔",
    pay_easypaisa: "ايزي پيسا", pay_jazzcash: "جاز ڪيش", pay_agent: "مقامي ايگري ايجنٽ ذريعي نقد",
    bk_name: "توهان جو نالو", bk_phone: "موبائل نمبر", bk_privacy: "صرف هن بڪنگ لاءِ استعمال ٿيندو (سيڪشن 12.2)۔",
    bk_submit: "بڪنگ جي درخواست موڪليو", cancel: "منسوخ", close: "بند ڪريو", included_word: "شامل", not_added: "شامل ناهي",
    err_date: "ڪرائي جي تاريخ چونڊيو۔", err_name: "پنهنجو نالو لکو۔", err_phone: "صحيح موبائل نمبر لکو (03XXXXXXXXX)۔", err_ack: "مهرباني ڪري ڊرائي رينٽ جون شرطون قبول ڪريو۔",
    st_sent: "درخواست موڪلي وئي", st_confirmed: "مالڪ تصديق ڪئي", st_completed: "ڪرايو مڪمل", st_feedback: "راءِ جمع ٿي", st_declined: "مالڪ انڪار ڪيو", st_cancelled: "منسوخ",
    mb_title: "منهنجون بڪنگون", mb_empty: "اڃا ڪا بڪنگ ناهي۔ بازار مان مشين جي درخواست ڪريو۔", mb_complete: "ڪرايو مڪمل ڪريو", mb_feedback: "راءِ جمع ڪريو",
    mb_cancel: "درخواست منسوخ ڪريو", mb_waiting: "مالڪ جي تصديق جو انتظار آهي۔", mb_go_owner: "مالڪ پورٽل کوليو",
    mb_rate: "هن ڪرائي کي درجو ڏيو", mb_comment: "راءِ (اختياري)", mb_thanks: "مهرباني۔ توهان جي راءِ محفوظ ٿي وئي۔", mb_via_ussd: "USSD / ايگري ايجنٽ ذريعي بڪنگ", mb_via_app: "ايپ ذريعي بڪنگ",
    ow_title: "مالڪ پورٽل", ow_sub: "پنهنجون مشينون، بڪنگ درخواستون ۽ ڪمائي سنڀاليو۔",
    ow_list: "موجود مشينري لکرايو", ow_requests: "درخواستون", ow_earn: "ڪمائيءَ جو اندازو", ow_my: "لکيل مشينري",
    ow_name: "مشين جو نالو ۽ ماڊل", ow_cat: "قسم", ow_rate: "في ڪلاڪ ڪرايو (رپيا)", ow_village: "ڳوٺ / علائقو", ow_dist: "سروس ايريا کان فاصلو (ڪلوميٽر)",
    ow_opterm: "آپريٽر جون شرطون", ow_trterm: "ٽرانسپورٽ جون شرطون", ow_ownername: "مالڪ جو نالو", ow_spec: "اهم تفصيل (هارس پاور، اوزار)",
    ow_fuel: "ڊيزل جي شرط مقرر آهي: ڊرائي رينٽ، ڊيزل هاريءَ جو۔", ow_submit: "بازار ۾ شامل ڪريو", ow_approve: "منظور", ow_decline: "انڪار",
    ow_no_req: "هن وقت ڪا التوا ۾ درخواست ناهي۔", ow_pending: "التوا ۾", ow_history: "جواب ڏنو ويو", ow_available: "موجود", ow_hidden: "لڪيل", ow_remove: "هٽايو",
    es_machine: "مشين", es_hours: "روزانو واندا ڪلاڪ", es_days: "موسم ۾ ڪرائي جا ڏينهن", es_util: "متوقع بڪنگ جي شرح",
    es_result: "موسم جي اندازي ڪرائي ڪمائي", es_month: "في موسم", es_confirmed: "اڃا تائين تصديق ٿيل بڪنگن مان",
    es_note: "6٪ ڪميشن (ننڍن هارين لاءِ 4٪) هاري جي بل ۾ شامل ٿئي ٿي، تنهنڪري مالڪ کي پورو مسواڙ ملي ٿو۔ ڊيزل شامل ناهي (ڊرائي رينٽ)۔",
    ag_title: "ايگري ايجنٽ نيٽ ورڪ", ag_sub: "ڳوٺ جا دڪاندار سمارٽ فون کان سواءِ هارين کي مشينري بڪ ڪرڻ ۾ مدد ڪن ٿا۔",
    ag1_t: "ايگري ايجنٽ ڪير آهي؟", ag1_d: "ڳوٺ جو ڪرياني يا موبائل لوڊ جو دڪان، جنهن کي بڪنگ پوائنٽ طور سکيا ڏني وڃي ٿي۔",
    ag2_t: "اهي ڇا ٿا ڪن؟", ag2_d: "سروس سمجهائين ٿا، هارين کي رجسٽر ڪن ٿا، مشينون ڏيکارين ٿا ۽ بڪنگ موڪلين ٿا۔",
    ag3_t: "اهي ڪيئن ڪمائين ٿا؟", ag3_d: "هر مڪمل بڪنگ تي شفاف ڪميشن، هڪ کليل پاليسيءَ تحت۔",
    ag4_t: "هي ڇو اهم آهي", ag4_d: "منهن مٿي ڀروسو ٺهي ٿو ۽ ڪمزور سگنل وارا هاري به شامل ٿين ٿا۔",
    ussd_title: "يو ايس ايس ڊي بڪنگ", ussd_demo: "يو ايس ايس ڊي مينيو جي جھلڪ",
    ussd_steps: "ضميمو C فلو", ussd_hint: "ڪي پيڊ يا ڪي بورڊ استعمال ڪريو۔ موڪلڻ لاءِ سائو بٽڻ دٻايو۔",
    kh_title: "ايگري شيئر هاري هيلپر", kh_placeholder: "ڪلاڪن، خرچ يا مشين بابت پڇو...", kh_send: "موڪليو",
    kh_hello: "السلام عليڪم! مان ڪرائي جي ڪلاڪن ۽ ڊرائي رينٽ خرچ جو اندازو لڳائي سگهان ٿو ۽ مشين چونڊڻ ۾ مدد ڪري سگهان ٿو۔ اردو، انگريزي يا رومن اردو ۾ پڇو۔",
    kh_ai: "Claude AI", kh_offline: "اندروني هيلپر", kh_thinking: "سوچي رهيو آهيان...",
    toast_booked: "بڪنگ جي درخواست مالڪ کي موڪلي وئي۔", toast_listed: "جمع ٿي وئي۔ ايگري شيئر ٽيم جي منظوري کان پوءِ بازار ۾ ايندي۔", toast_confirmed: "بڪنگ جي تصديق ٿي وئي۔", toast_declined: "بڪنگ رد ٿي وئي۔",
    toast_completed: "ڪرايو مڪمل ٿيو۔", toast_feedback: "راءِ جمع ٿي۔", toast_cancelled: "بڪنگ جي درخواست منسوخ ٿي۔", toast_removed: "لسٽ هٽائي وئي۔",
    sindhi_note: "سنڌي مستقبل جي توسيع جو پيش منظر آهي۔ پائلٽ پنجابي ۽ اردو ۾ آهي۔",
    tr_fee: "ٽرانسپورٽ اختياري: {km} ڪلوميٽر لاءِ +{fee}",
    bk_offer_toggle: "پنهنجي قيمت ٻڌايو",
    bk_offer_sub: "ڪرايو وڌيڪ لڳي ٿو؟ مالڪ کي آڇ موڪليو۔ هو قبول، جوابي آڇ يا انڪار ڪري سگهي ٿو۔",
    bk_offer_rate: "توهان جي في ڪلاڪ آڇ (رپيا)",
    bk_offer_tr: "توهان جي ٽرانسپورٽ آڇ (رپيا)",
    bk_offer_note: "مالڪ لاءِ پيغام (اختياري)",
    bk_offer_note_ph: "مثال: مان صرف 2 ڪلوميٽر پري آهيان، ٽرانسپورٽ گهٽ ڪريو؟",
    bk_offer_min: "آڇ {min} ۽ {max} جي وچ ۾ هجي۔",
    bk_listed: "لکيل",
    bk_your_offer: "توهان جي آڇ",
    bk_send_offer: "قيمت جي آڇ موڪليو",
    st_countered: "مالڪ جي جوابي آڇ",
    offer_badge: "قيمت جي آڇ",
    mb_counter: "مالڪ جوابي آڇ موڪلي:",
    mb_accept_counter: "جوابي آڇ قبول ڪريو",
    mb_decline_counter: "انڪار",
    mb_offer_line: "توهان جي آڇ: {rate}/ڪلاڪ",
    mb_signin: "پنهنجون بڪنگون ڏسڻ لاءِ سائن ان ڪريو۔",
    ow_offer_from: "هاريءَ جي آڇ",
    ow_accept_offer: "آڇ قبول ڪريو",
    ow_counter: "جوابي آڇ",
    ow_send_counter: "جوابي آڇ موڪليو",
    ow_counter_rate: "توهان جو في ڪلاڪ ڪرايو (رپيا)",
    ow_counter_tr: "ٽرانسپورٽ (رپيا)",
    ow_note: "پيغام",
    toast_offer: "قيمت جي آڇ مالڪ کي موڪلي وئي۔",
    toast_countered: "جوابي آڇ هاريءَ کي موڪلي وئي۔",
    nav_members: "ميمبر",
    auth_signin: "سائن ان",
    auth_signup: "سائن اپ",
    auth_signout: "سائن آئوٽ",
    au_title_in: "ڀلي ڪري آيا",
    au_title_up: "پنهنجو ايگري شيئر کاتو ٺاهيو",
    au_title_reset: "پاس ورڊ ري سيٽ ڪريو",
    au_sub: "بڪنگ، قيمت جي آڇ ۽ مشينري لکرائڻ لاءِ سائن ان ڪريو۔",
    au_name: "پورو نالو",
    au_email: "اي ميل",
    au_phone: "موبائل نمبر",
    au_pass: "پاس ورڊ",
    au_pass2: "پاس ورڊ ٻيهر",
    au_role: "مان آهيان",
    role_renter: "هاري / ڪرائيدار",
    role_owner: "مشينري مالڪ",
    role_agent: "ايگري ايجنٽ",
    au_district: "ضلعو",
    au_consent: "مان متفق آهيان ته ايگري شيئر منهنجو نالو، اي ميل، موبائل ۽ ضلعو صرف کاتي هلائڻ لاءِ محفوظ ڪري (سيڪشن 12.2)۔",
    au_create: "کاتو ٺاهيو",
    au_login: "سائن ان",
    au_have: "اڳ ۾ ئي کاتو آهي؟",
    au_new: "ايگري شيئر تي نوان آهيو؟",
    au_forgot: "پاس ورڊ وسري ويو؟",
    au_reset_btn: "نئون پاس ورڊ رکو",
    au_reset_note: "هن اي ميل سان رجسٽر ٿيل اڪائونٽ جو پاسورڊ توهان ٻيهر رکي سگهو ٿا۔",
    au_back: "سائن ان ڏانهن واپس",
    au_err_name: "پورو نالو لکو۔",
    au_err_email: "صحيح اي ميل لکو۔",
    au_err_pass: "پاس ورڊ گهٽ ۾ گهٽ 6 اکرن جو هجي۔",
    au_err_pass2: "پاس ورڊ هڪجهڙا ناهن۔",
    au_err_consent: "مهرباني ڪري پرائيويسي نوٽ قبول ڪريو۔",
    au_err_wrong: "اي ميل يا پاس ورڊ غلط آهي۔",
    au_err_none: "ڪو کاتو نه مليو۔ پهريان سائن اپ ڪريو۔",
    au_err_exists: "هن لاگ ان مان کاتو اڳ ۾ ئي موجود آهي۔ سائن ان ڪريو۔",
    au_err_taken: "هي اي ميل اڳ ۾ رجسٽرڊ آهي۔ سائن ان ڪريو۔",
    au_err_generic: "ڪجهه غلط ٿيو۔ ٻيهر ڪوشش ڪريو۔",
    au_need: "جاري رکڻ لاءِ سائن ان ڪريو يا کاتو ٺاهيو۔",
    au_local_note: "صرف هن براؤزر ۾ محفوظ (گڏيل رڪارڊ هتي موجود ناهن)۔",
    toast_welcome: "ڀلي ڪري آيا، {name}!",
    toast_signedout: "توهان سائن آئوٽ ٿي ويا۔",
    toast_registered: "کاتو ٺهي ويو۔ ايگري شيئر ۾ ڀلي ڪري آيا!",
    toast_reset: "پاس ورڊ مٽجي ويو۔ سائن ان ڪريو۔",
    mem_title: "رجسٽرڊ ميمبر",
    mem_sub: "ايگري شيئر تي سائن اپ ڪندڙ سڀ ماڻهو، اي ميل ۽ ڪردار سان۔",
    mem_total: "ڪل ميمبر",
    mem_search: "نالو، اي ميل يا ضلعو ڳوليو",
    mem_empty: "اڃا ڪنهن به رجسٽر نه ڪيو آهي۔",
    mem_joined: "شامل ٿيو",
    mem_last: "آخري سائن ان",
    mem_copy: "CSV ڪاپي ڪريو",
    mem_copied: "ڪاپي ٿي ويو",
    mem_cloud: "سڌو گڏيل رڪارڊ۔ هي لسٽ صرف توهان (مالڪ) ۽ ايڊيٽر ڏسي سگهن ٿا۔",
    mem_local: "رڪارڊ صرف هن برائوزر ۾ محفوظ آهن۔",
    mem_loading: "ميمبر لوڊ ٿي رهيا آهن...",
    mem_slow: "رڪارڊ لوڊ ٿيڻ ۾ وقت لڳي رهيو آهي۔",
    nav_admin: "ايڊمن پينل",
    ad_title: "ايڊمن پينل",
    ad_sub: "نئين مشينري جي تصديق ڪريو، بڪنگون ۽ ڪميشن ڏسو ۽ پليٽ فارم اگهه مقرر ڪريو۔",
    ad_lock_title: "ايڊمن رسائي",
    ad_lock_sub: "ڪنٽرول پينل کولڻ لاءِ ايڊمن پن لکو۔",
    ad_pin: "پن",
    ad_unlock: "کوليو",
    ad_pin_wrong: "غلط پن۔ ٻيهر ڪوشش ڪريو۔",
    ad_lock: "لاڪ",
    ad_verify: "مشينري جي تصديق",
    ad_ledger: "بڪنگون ۽ ڪميشن",
    ad_settings: "پليٽ فارم سيٽنگون",
    ad_requests: "پنهنجي ٻولي درخواستون",
    ad_pending: "تصديق جي انتظار ۾",
    ad_approve: "منظور",
    ad_reject: "رد",
    ad_none: "اڃا ڪجهه ناهي۔",
    ad_submitted: "جمع",
    ad_kpi_bookings: "ڪل بڪنگون",
    ad_kpi_gtv: "ڪل لين دين جي رقم",
    ad_kpi_comm: "ڪمايل ڪميشن",
    ad_kpi_pending: "التوا ۾ ڪميشن",
    ad_col_id: "بڪنگ",
    ad_col_date: "تاريخ",
    ad_col_machine: "مشين",
    ad_col_renter: "ڪرائيدار",
    ad_col_channel: "ذريعو",
    ad_col_status: "حالت",
    ad_col_value: "رقم",
    ad_col_comm: "ڪميشن",
    ad_diesel: "قومي ڊيزل اگهه (رپيا في ليٽر)",
    ad_diesel_sub: "هي اگهه سڄي ايپ ۾ درخواست موڪليو (ٽيئي درجا، 100 ڪلوميٽر سميت) ۽ هاري هيلپر ۾ استعمال ٿئي ٿو۔",
    ad_save: "محفوظ ڪريو",
    ad_updated: "آخري تبديلي",
    ad_diesel_preview: "مثال: هارويسٽر 4 ڪلاڪن ۾ لڳ ڀڳ {l} ليٽر = {v} جو ڊيزل۔",
    ad_districts: "پائلٽ ضلعا",
    ad_districts_sub: "بند ضلعن جون مشينون هارين ۽ نئين لسٽن کان لڪي وڃن ٿيون۔",
    ad_min_one: "گهٽ ۾ گهٽ هڪ ضلعو چالو رکو۔",
    ad_reset: "ڊيمو ڊيٽا ري سيٽ",
    ad_reset_sub: "6 نمونا مشينون واپس، بڪنگون ۽ درخواستون صاف ۽ ڊيزل اگهه ري سيٽ۔",
    ad_reset_confirm: "پڪ لاءِ ٻيهر دٻايو",
    ad_req_rate: "آڇ",
    ad_req_tier: "پهتل درجو",
    rq_open: "کليل",
    rq_booked: "بڪ ٿي وئي",
    rq_closed: "بند",
    ls_pending: "تصديق جي انتظار ۾",
    ls_approved: "منظور",
    ls_rejected: "رد",
    toast_approved: "لسٽ منظور، هاڻي بازار ۾ آهي۔",
    toast_rejected: "لسٽ رد۔",
    toast_diesel: "ڊيزل اگهه سڄي ايپ ۾ {v} في ليٽر ٿي ويو۔",
    toast_demo_reset: "مارڪيٽ ڊيٽا ري سيٽ ٿي وئي۔",
    lr_diesel_admin: "قومي ڊيزل اگهه: {v} في ليٽر",
    lr_recent: "توهان جون تازيون درخواستون",
    bk_smallholder: "ننڍو هاري (5 ايڪڙ کان گهٽ)",
    bk_smallholder_sub: "عام 6% بدران رعايتي 4% ڪميشن۔",
    pay_paylater: "هاڻي لابارو، پوءِ ادائيگي (30% هاڻي + 70% لاباري کان پوءِ)",
    pl_now: "هاڻي ادائيگي (30%)",
    pl_later: "لاباري کان پوءِ (70%)",
    pl_partner: "قرض پارٽنر (تجويز ڪيل)",
    pl_due: "70% واپسي جي مدت",
    pl_days: "ڏينهن",
    pl_due_on: "آخري تاريخ",
    pl_now_short: "هاڻي",
    pl_risk: "70% رقم ٽئين ڌر مائڪروفنانس پارٽنر جو قرض آهي، واپسي جو خطرو پارٽنر جو۔ ايگري شيئر تي ڪو قرض خطرو ناهي۔ پارٽنرن جا نالا صرف تجويز آهن (ڪو معاهدو ناهي) ۽ پارٽنر في لاڳو ٿي سگهي ٿي۔",
    pl_settled: "ادا ٿي ويو",
    pl_pending: "70% باقي",
    pl_settled_by: "ايگري منڊي وڪري {id} مان پاڻمرادو ادا ٿيو۔",
    pl_settle_mandi: "ايگري منڊي تي فصل وڪڻي ادا ڪريو",
    kp_title: "سمارٽ فون ناهي؟ سادي فون سان بڪنگ ڪريو",
    kp_sub: "ڪنهن به سادي فون مان ٽول فري هيلپ لائن تي ڪال ڪريو يا USSD ڪوڊ ملايو۔ پنجابي يا اردو آواز قدم بقدم رهنمائي ڪري ٿو ۽ بڪنگ جي تصديق SMS تي اچي ٿي۔",
    kp_toll: "ٽول فري هيلپ لائن",
    kp_ussd: "USSD ڪوڊ",
    kp_demo: "ڪنهن به موبائل نيٽ ورڪ تان مفت۔",
    kp_ivr: "IVR آواز جا قدم",
    kp_try: "ڪي پيڊ بڪنگ آزمايو",
    nav_mandi: "ايگري منڊي",
    am_title: "ايگري منڊي: پنهنجي فصل وڪڻو",
    am_sub: "پنهنجي فصل ۽ قيمت موڪليو۔ رجسٽرڊ اٽي جون ملون، چانورن جون ملون ۽ وڏا خريدار توهان جي قيمت تي لائيو بولي ڏين ٿا۔ بهترين آڇ چونڊيو۔",
    am_credit: "توهان جو باقي مشينري قرض (70%)",
    am_credit_n: "بڪنگون هاڻي لابارو، پوءِ ادائيگي تي",
    am_closed_loop: "ڪلوزڊ لوپ ادائيگي",
    am_closed_title: "توهان جي فصل جي وڪري سان مشينري جو قرض پاڻمرادو ادا",
    am_loop1: "صرف 30% اڳواٽ ڏئي مشين ڪرائي تي وٺو",
    am_loop2: "پنهنجي فصل لڻو",
    am_loop3: "ايگري منڊي تي تصديق ٿيل خريدار کي وڪڻو",
    am_loop4: "باقي 70% پارٽنر کي ۽ خالص منافعو توهان جي جاز ڪيش يا ايزي پيسا ۾",
    am_crop: "فصل",
    crop_wheat: "ڪڻڪ",
    crop_rice: "چانور",
    crop_maize: "مڪئي",
    crop_cotton: "ڪپهه",
    am_qty: "مقدار (مڻ، 40 ڪلو)",
    am_grade: "معيار",
    am_grade_a: "درجو A (صاف، سڪل)",
    am_grade_b: "درجو B",
    am_rate: "توهان جي متوقع قيمت (رپيا في مڻ)",
    am_bench_src: "مارڪيٽ رهنمائي: لڳ ڀڳ {r} في مڻ (تازين پنجاب منڊي رپورٽن مان)۔",
    am_bench_est: "مارڪيٽ رهنمائي: لڳ ڀڳ {r} في مڻ (اندازي)۔",
    am_expected_total: "متوقع ڪل رقم",
    am_wallet: "ادائيگي وصول ڪريو",
    am_wallet_no: "والٽ موبائل نمبر",
    am_post: "فصل موڪليو ۽ بوليون وٺو",
    am_new: "نئين وڪري پوسٽ",
    am_recent: "توهان جون تازيون فصل پوسٽون",
    am_mann: "مڻ",
    am_st_open: "کليل",
    am_st_sold: "وڪامي وئي",
    am_st_closed: "بند",
    am_bids: "خريدارن جون لائيو بوليون",
    am_waiting: "خريدار بولي ڏئي رهيا آهن...",
    am_bids_n: "بوليون",
    am_idle: "ملن ۽ وڏن خريدارن کان بوليون وٺڻ لاءِ فصل موڪليو۔",
    am_no_bids: "ڪو خريدار توهان جي قيمت تي نه آيو۔ ٿوري گهٽ قيمت يا نئين پوسٽ آزمايو۔",
    am_type_flour: "اٽي جي مل",
    am_type_rice: "چانورن جي مل",
    am_type_feed: "فيڊ / نشاستي مل",
    am_type_ginning: "جننگ ڪارخانو",
    am_type_bulk: "وڏو خريدار",
    am_sample: "نمونو خريدار",
    am_above: "توهان جي قيمت کان وڌيڪ بولي",
    am_pickup: "خريدار ٻني مان کڻندو",
    am_settlement: "ادائيگي جو جائزو",
    am_gross: "فصل جي وڪري",
    am_minus_credit: "مشينري قرض جي واپسي (70%)",
    am_unsettled: "{v} قرض باقي رهندو ڇو ته هي وڪرو پورو نٿو ڪري۔",
    am_net: "توهان جو خالص منافعو",
    am_to_wallet: "خريدار جي ادائيگي کان پوءِ رقم توهان جي {w} {n} ۾۔",
    am_confirm: "وڪرو پڪو ڪريو",
    am_done: "وڪرو پڪو ۽ ادائيگي مڪمل۔",
    am_sold_to: "خريدار",
    am_demo_note: "ايگري شيئر هر ادائيگي جو رڪارڊ رکي ٿو۔",
    toast_sold: "وڪرو پڪو۔ {net} خالص منافعو توهان جي والٽ ۾۔",
    ad_kpi_credit: "باقي لاباري قرض (پارٽنر جو)",
    kh_short: "هاري هيلپر",
    kp_ivr_pa: "پنجابي IVR",
    kp_ivr_ur: "اردو IVR",
    exp_note: "سنڌي مستقبل جي توسيع جو پيش منظر آهي۔ پائلٽ پنجابي ۽ اردو ۾ آهي۔",
    ab_name: "پنهنجي ٻولي (پنهنجو اگهه ٻڌايو)",
    ab_tag: "پنهنجو مسواڙ ٻڌايو، ويجهڙا مالڪ آڇون موڪليندا",
    zs_title: "ايگري شيئر مددگار سروس ۽ پارٽنر نيٽ ورڪ",
    zs_sub: "{place} جي ويجهو اڃا {machine} جو ڪو رجسٽر مالڪ آن لائن ناهي۔ تڏهن به توهان جو ڪم ٿيندو۔ هڪ رستو چونڊيو:",
    zs_a: "ڳولا جو دائرو 100 ڪلوميٽر تائين وڌايو",
    zs_a_d: "پنهنجي درخواست ويجهن تعلقن ۽ ضلعن جي تصديق ٿيل مالڪن تائين موڪليو۔ ٽرانسپورٽ ۽ ڊيزل جو خرچ اڳ ۾ ڏيکاريل آهي:",
    zs_a_btn: "100 ڪلوميٽر تائين موڪليو",
    zs_a_done: "ڳولا اڳ ۾ ئي 100 ڪلوميٽر تائين ٿي رهي آهي۔",
    zs_km: "{km} ڪلوميٽر پري",
    zs_transport: "ٽرانسپورٽ",
    zs_fuel: "ڊيزل",
    zs_total: "اندازاً ڪل",
    zs_b: "ڳوٺ جو ايگري ايجنٽ ۽ مقامي پارٽنر",
    zs_b_d: "پنهنجي درخواست اسان جي مقامي ايگري ايجنٽ ۽ پارٽنر رينٽل نيٽ ورڪ کي موڪليو۔ اسان جي ٽيم ڳوٺ جي ٽريڪٽر مالڪن سان ڳالهائي 2 کان 4 ڪلاڪن ۾ SMS يا ڪال ذريعي تصديق ڪندي۔",
    zs_b_btn: "ايگري ايجنٽ ٽيم کي موڪليو",
    zs_b_done: "ٽڪيٽ {id}: ايگري ايجنٽ 2 کان 4 ڪلاڪن ۾ {phone} تي ڪال ڪندو۔",
    zs_c: "مون کي ٻڌايو ۽ رعايت حاصل ڪريو",
    zs_c_d: "اسان توهان جي درخواست محفوظ ڪنداسين۔ جيئن ئي {district} ۾ ڪو مالڪ رجسٽر ٿيندو، هو توهان کي انتظار ڪندڙ هاري طور ڏسندو ۽ توهان کي ان بڪنگ تي پليٽ فارم في ۾ {pct}٪ رعايت ملندي۔",
    zs_c_btn: "مون کي ٻڌايو",
    zs_c_done: "محفوظ ٿي ويو ({id})۔ {district} ۾ مالڪ رجسٽر ٿيندي ئي اسان توهان کي ٻڌائينداسين۔",
    zs_phone: "ڪال بيڪ لاءِ فون نمبر",
    zs_machine: "گهربل مشين",
    ow_ownerphone: "مالڪ جو فون (ڪال ۽ واٽس ايپ)",
    ow_waiting: "توهان جي ضلعي ۾ انتظار ڪندڙ هاري",
    ow_waiting_sub: "جڏهن هتي ڪو مالڪ رجسٽر نه هو تڏهن محفوظ ڪيل اصل درخواستون۔ مناسب مشين لسٽ ڪريو ۽ پهريان انهن سان رابطو ڪريو۔",
    ow_waiting_none: "اڃا ڪو هاري انتظار ۾ ناهي۔",
    ow_waiting_list: "مناسب مشين لسٽ ڪريو",
    toast_waiting: "{district} ۾ {n} هاري اڳ ۾ ئي {machine} جي انتظار ۾ آهن۔",
    lr_listed: "مقرر اگهه · مالڪ تصديق ڪندو",
    lr_step_locked: "مشين يا اگهه بدلائڻ لاءِ نئين درخواست شروع ڪريو۔",
    toast_lr_sent: "درخواست {owner} کي موڪلي وئي۔ هو پنهنجي اونر پورٽل مان تصديق ڪندا۔",
    mode_badge_live: "لائيو · صرف تصديق ٿيل مالڪ",
    mode_badge_demo: "نمونو ڊيٽا آن",
    au_err_provider: "فائر بيس ۾ اي ميل/پاسورڊ لاگ اِن بند آهي۔ فائر بيس ڪنسول ۾ Authentication > Sign-in method مان چالو ڪريو۔",
    au_err_network: "فائر بيس سان رابطو نه ٿيو۔ انٽرنيٽ ڏسي ٻيهر ڪوشش ڪريو۔",
    au_err_admin_local: "ايڊمن اڪائونٽ فائر بيس اڪائونٽ هجڻ گهرجي۔ جيڪڏهن \"غلط پاسورڊ\" اچي ته هڪ ڀيرو سائن اپ ڪريو۔",
    ad403_title: "403 — صرف بااختيار ايگري شيئر انتظاميه",
    ad403_sub: "هي حصو صرف ايگري شيئر جي باني ۽ بااختيار ٽيم ايڊمنن لاءِ آهي۔",
    ad403_signin: "ايڊمن اڪائونٽ سان سائن اِن ڪريو",
    ad403_home: "مارڪيٽ تي واپس وڃو",
    ad403_local: "توهان {email} سان اهڙي اڪائونٽ ۾ سائن اِن آهيو جيڪو صرف هن برائوزر ۾ آهي، فائر بيس ۾ نه۔ ايڊمن لاءِ فائر بيس اڪائونٽ ضروري آهي۔",
    ad403_phone: "توهان فون نمبر سان سائن اِن آهيو۔ ايڊمن لاءِ باني جو اي ميل اڪائونٽ ضروري آهي۔",
    ad403_other: "توهان {email} سان سائن اِن آهيو، جيڪو بااختيار ايڊمن اي ميل ناهي۔",
    ad403_fix: "سائن آئوٽ ڪري فائر بيس سان سائن اِن ڪريو",
    dm_agent_dispatch: "ايگري ايجنٽ روانگي",
    dm_notify: "مون کي ٻڌايو",
    vc_no_speech: "ڪو آواز نه ٻڌو — ٻيهر ڪوشش لاءِ مائيڪ دٻايو۔",
    vc_again: "ٻيهر ڳالهائڻ لاءِ دٻايو",
    vc_replay: "ٻڌو"
  },
  ps: {
    au_m_email: "برېښنالیک",
    au_m_phone: "د تلیفون OTP",
    au_otp_send: "کوډ واستوئ",
    role_buyer: "د فصل پیرودونکی",
    loc_title: "خپل ځای وټاکئ",
    loc_district: "ولسوالۍ",
    loc_village: "کلی / چک / تحصیل",
    loc_gps: "زما اوسنی GPS ځای وکاروئ",
    loc_save: "ځای خوندي کړئ",
    loc_your: "ستاسو د پټي ځای",
    loc_farm: "د پټي ځای",
    loc_machine: "ماشین چیرته ساتل کیږي؟",
    loc_err: "مهرباني وکړئ خپل ځای وټاکئ.",
    vc_title: "ژوندۍ غږیزه اړیکه",
    vc_start: "غږیزه اړیکه پیل کړئ",
    vc_end: "غږیزه اړیکه پای ته ورسوئ",
    vc_listening: "اورم… خبرې وکړئ",
    vc_speaking: "خبرې کوم…",
    vc_tap_btn: "د خبرو لپاره کېکاږئ",

    vc_you_said: "تاسو وویل",
    vc_mute: "غږ بند",
    vc_unmute: "غږ پرانیزئ",
    nav_live: "غوښتنه واستوئ",
    cta_live: "غوښتنه واستوئ (خپله بولي)",
    nav_market: "د ماشینونو بازار",
    nav_bookings: "زما بکنګونه",
    nav_owner: "د مالک پورټل",
    nav_agent: "اګري اېجنټ او USSD",
    tagline: "سرچینې شریکې کړئ، یوځای وده وکړئ",
    hero_kicker: "پنجاب پیلوټ · ټرېکټر · تریشر · هارویسټر",
    hero_title: "ماشین اخیستل ضروري نه دي، په کرایه یې واخلئ.",
    hero_owner: "ستاسو وزګار ماشینونه له کرایې ګټه کولی شي.",
    hero_desc: "خپل کلي ته نږدې ټرېکټر، تریشر او هارویسټر ومومئ، له بکنګ مخکې د وچې کرایې بشپړه بیه وګورئ، او په څو دقیقو کې غوښتنه واستوئ.",
    cta_find: "ماشینونه ومومئ",
    cta_list: "خپل ماشین ثبت کړئ",
    stat_pilot: "د پنجاب پیلوټ سیمې",
    stat_radius: "کیلومتره لټون",
    stat_comm: "د پلیټ فارم کمیشن",
    stat_cats: "د ماشینونو ډولونه",
    how_title: "اګري شېئر څنګه کار کوي",
    how1: "مالک وزګار ماشین ثبتوي",
    how2: "بزګر په 15 کیلومترو کې لټون کوي",
    how3: "د وچې کرایې بشپړه بیه ګوري",
    how4: "مالک تایید کوي، کار کېږي",
    filters: "فلټرونه",
    f_category: "د ماشین ډول",
    cat_all: "ټول",
    cat_tractor: "ټرېکټرونه",
    cat_thresher: "تریشرونه",
    cat_harvester: "هارویسټرونه",
    one_tractor: "ټرېکټر",
    one_thresher: "تریشر",
    one_harvester: "هارویسټر",
    f_district: "د پنجاب ضلع",
    all_districts: "ټولې ضلعې",
    f_radius: "د لټون ساحه",
    f_search: "ماشین یا کلی ولټوئ",
    km: "کیلومتره",
    radius_note: "په ډیفالټ 15 کیلومتره، تر 25 کیلومترو پورې",
    results: "{n} ماشینونه وموندل شول",
    no_results: "د دې فلټرونو سره هېڅ ماشین ونه موندل شو. د لټون ساحه زیاته کړئ یا ټولې ضلعې وټاکئ.",
    reset: "فلټرونه بیا تنظیم کړئ",
    per_hour: "/ساعت",

    distance: "لرې",
    dry_rent: "وچه کرایه: ډیزل پکې نه دی",
    op_included: "چلوونکی (ډرایور) په کرایه کې شامل",
    op_optional: "چلوونکی (ډرایور) اختیاري: +500 روپۍ/ساعت",
    op_none: "چلوونکی نشته: خپل ډرایور راوړئ",
    tr_included: "ټرانسپورټ شامل",
    tr_optional: "ټرانسپورټ اختیاري (100 روپۍ فی کیلومتر، لږ تر لږه 500)",
    tr_self: "ټرانسپورټ د بزګر په غاړه",
    request: "د بکنګ غوښتنه",
    unavailable: "اوس شتون نلري",
    owner: "مالک",
    new_badge: "نوی لیست",
    bk_title: "د بکنګ غوښتنه",
    bk_date: "د کرایې نېټه",
    bk_hours: "د کار ساعتونه",
    bk_operator: "چلوونکی زیات کړئ",
    bk_transport: "ټرانسپورټ زیات کړئ",
    bk_breakdown: "د بیې روښانه تفصیل",
    bk_base: "اصلي وچه کرایه",
    bk_op: "چلوونکی",
    bk_tr: "ټرانسپورټ",
    bk_sub: "فرعي ټوټل",
    bk_comm: "د پلیټ فارم کمیشن ({p})",
    bk_total: "ټوله اټکلي بیه",
    bk_fuel_line: "ډیزل: بزګر یې ورکوي (په بیه کې نه دی)",
    bk_ack: "زه پوهېږم چې دا وچه کرایه ده: ډیزل به زه ورکوم، او د اضافي وخت او ناوخته ورګرځولو شرطونه به له تایید مخکې له مالک سره ټاکل کېږي.",
    bk_pay: "د تادیې طریقه",

    pay_easypaisa: "ایزي پیسه",
    pay_jazzcash: "جاز کیش",
    pay_agent: "د سیمه‌ییز اګري اېجنټ له لارې نغدې",
    bk_name: "ستاسو نوم",
    bk_phone: "د موبایل شمېره",
    bk_privacy: "یوازې د دې بکنګ لپاره کارول کېږي (برخه 12.2).",
    bk_submit: "د بکنګ غوښتنه واستوئ",
    cancel: "لغوه",
    close: "بندول",
    included_word: "شامل",
    not_added: "نه دی زیات شوی",
    err_date: "د کرایې نېټه وټاکئ.",
    err_name: "خپل نوم ولیکئ.",
    err_phone: "سمه پاکستاني موبایل شمېره ولیکئ (03XXXXXXXXX).",
    err_ack: "مهرباني وکړئ د وچې کرایې شرطونه ومنئ.",
    st_sent: "غوښتنه واستول شوه",
    st_confirmed: "مالک تایید کړه",
    st_completed: "کرایه بشپړه شوه",
    st_feedback: "نظر وسپارل شو",
    st_declined: "مالک رد کړه",
    st_cancelled: "لغوه شوه",
    kh_title: "اګري شېئر بزګر مرستیال",
    kh_short: "بزګر مرستیال",
    kh_placeholder: "د ساعتونو، لګښت یا ماشین په اړه پوښتنه وکړئ...",
    kh_send: "ولېږئ",
    kh_hello: "السلام علیکم! زه د کرایې ساعتونه او د وچې کرایې لګښت اټکل کولی شم، د ماشین په ټاکلو او د ویب پاڼې په کارولو کې مرسته کوم. په پښتو، اردو یا انګرېزي پوښتنه وکړئ.",
    kh_ai: "Claude AI",
    kh_offline: "دننه مرستیال",
    kh_thinking: "فکر کوم...",
    tr_fee: "ټرانسپورټ اختیاري: د {km} کیلومترو لپاره +{fee}",
    bk_offer_toggle: "خپله بیه وړاندې کړئ",
    bk_offer_sub: "کرایه ډېره ښکاري؟ مالک ته وړاندیز ولېږئ. هغه یې منلی، بل وړاندیز ورکولی یا ردولی شي.",
    bk_offer_rate: "ستاسو فی ساعت وړاندیز (روپۍ)",
    bk_offer_tr: "ستاسو د ټرانسپورټ وړاندیز (روپۍ)",
    bk_offer_note: "مالک ته پیغام (اختیاري)",
    bk_offer_note_ph: "لکه: زه یوازې 2 کیلومتره لرې یم، ټرانسپورټ کم کړئ؟",
    bk_offer_min: "وړاندیز باید د {min} او {max} ترمنځ وي.",
    bk_listed: "ثبت شوې",
    bk_your_offer: "ستاسو وړاندیز",
    bk_send_offer: "د بیې وړاندیز ولېږئ",
    st_countered: "د مالک بل وړاندیز",
    nav_members: "غړي",
    auth_signin: "ننوتل",
    auth_signup: "نوم لیکنه",
    auth_signout: "وتل",
    role_renter: "بزګر / کرایه اخیستونکی",
    role_owner: "د ماشین مالک",
    role_agent: "اګري اېجنټ",
    nav_admin: "اډمن پینل",
    bk_smallholder: "کوچنی بزګر (له 5 ایکړو کم)",
    bk_smallholder_sub: "د عام 6% پر ځای 4% رعایتي کمیشن.",
    pay_paylater: "اوس لو، وروسته تادیه (اوس 30% + له لو وروسته 70%)",
    pl_now: "اوس تادیه (30%)",
    pl_later: "له لو وروسته (70%)",
    pl_partner: "د پور شریک (وړاندیز شوی)",
    pl_due: "70% بېرته ورکول وروسته له",
    pl_days: "ورځو",
    pl_due_on: "وروستۍ نېټه",
    pl_now_short: "اوس",
    pl_risk: "70% د دریم اړخ مایکروفنانس شریک پور دی، چې د بېرته ورکولو خطر یې پر غاړه دی. پر اګري شېئر د پور هېڅ خطر نشته. د شریکانو نومونه یوازې وړاندیز دي (هېڅ تړون نشته) او د شریک فیس کېدای شي ولګېږي.",
    pl_settled: "تادیه شوه",
    pl_pending: "70% پاتې",
    pl_settled_by: "د اګري منډۍ د پلور {id} څخه په خپله تادیه شو.",
    pl_settle_mandi: "په اګري منډۍ کې د فصل په پلورلو تادیه کړئ",
    kp_title: "سمارټ فون نه لرئ؟ په ساده ټیلیفون بکنګ وکړئ",
    kp_sub: "له هر ساده ټیلیفون څخه وړیا هېلپ لاین ته زنګ ووهئ یا USSD کوډ ډایل کړئ. پنجابي یا اردو غږ ګام په ګام لارښوونه کوي، او بکنګ مو په SMS تاییدېږي.",
    kp_toll: "وړیا هېلپ لاین",
    kp_ussd: "USSD کوډ",

    kp_ivr: "د IVR غږ ګامونه واورئ",

    kp_ivr_pa: "پنجابي IVR",
    kp_ivr_ur: "اردو IVR",
    nav_mandi: "اګري منډۍ",
    am_title: "اګري منډۍ: خپل فصل وپلورئ",
    am_sub: "خپل فصل او بیه ثبت کړئ. ثبت شوي د اوړو ملونه، د وريجو ملونه او لوی پېرودونکي ستاسو پر بیه ژوندۍ داوطلبي کوي. غوره وړاندیز وټاکئ.",
    am_credit: "ستاسو پاتې د ماشین پور (70%)",
    am_credit_n: "بکنګونه په اوس لو، وروسته تادیه",
    am_closed_loop: "تړلې کړۍ تصفیه",
    am_closed_title: "ستاسو د فصل پلور ستاسو د ماشین پور په خپله ادا کوي",
    am_loop1: "یوازې په 30% مخکینۍ تادیه ماشین په کرایه واخلئ",
    am_loop2: "خپل فصل ولو کړئ",
    am_loop3: "په اګري منډۍ کې یې تایید شوي پېرودونکي ته وپلورئ",
    am_loop4: "پاتې 70% شریک ته ورکول کېږي او خالصه ګټه مو جاز کیش یا ایزي پیسه ته ځي",
    am_crop: "فصل",
    crop_wheat: "غنم",
    crop_rice: "وريجې",
    crop_maize: "جوار",
    crop_cotton: "پنبه",
    am_qty: "مقدار (من، 40 کیلو)",
    am_grade: "کیفیت",
    am_grade_a: "درجه A (پاک، وچ)",
    am_grade_b: "درجه B",
    am_rate: "ستاسو تمه‌لرونکې بیه (روپۍ فی من)",
    am_bench_src: "د بازار لارښود: شاوخوا {r} فی من (د پنجاب د وروستیو راپورونو له مخې).",
    am_bench_est: "د بازار لارښود: شاوخوا {r} فی من (اټکلي).",
    am_expected_total: "ټولې تمه‌لرونکې پیسې",
    am_wallet: "تادیه ترلاسه کړئ په",
    am_wallet_no: "د والټ موبایل شمېره",
    am_post: "فصل ثبت کړئ او داوطلبۍ واخلئ",
    am_new: "نوی پلور",
    am_recent: "ستاسو وروستي فصلونه",
    am_mann: "من",
    am_st_open: "خلاص",
    am_st_sold: "پلورل شوی",
    am_st_closed: "بند",
    am_bids: "د پېرودونکو ژوندۍ داوطلبۍ",
    am_waiting: "پېرودونکي داوطلبي کوي...",
    am_bids_n: "داوطلبۍ",
    am_idle: "د ملونو او لویو پېرودونکو د داوطلبیو لپاره خپل فصل ثبت کړئ.",
    am_no_bids: "هېڅ پېرودونکی ستاسو بیې ته ونه رسېد. لږ کمه بیه یا نوی پلور وازمایئ.",
    am_type_flour: "د اوړو مل",
    am_type_rice: "د وريجو مل",
    am_type_feed: "د فیډ / نشایستې مل",
    am_type_ginning: "جننګ فابریکه",
    am_type_bulk: "لوی پېرودونکی",
    am_sample: "نمونه پېرودونکی",
    am_above: "ستاسو له بیې لوړه داوطلبي",
    am_pickup: "پېرودونکی یې له پټي وړي",
    am_settlement: "د تصفیې کتنه",
    am_gross: "د فصل د پلور ارزښت",
    am_minus_credit: "د ماشین پور بېرته ورکړل شو (70%)",
    am_unsettled: "{v} پور پاتې کېږي ځکه دا پلور یې بشپړ نه پوره کوي.",
    am_net: "ستاسو خالصه ګټه",

    am_confirm: "پلور تایید کړئ",
    am_done: "پلور تایید او تصفیه شو.",
    am_sold_to: "پېرودونکی",

    exp_note: "پښتو د پراختیا مخکتنه ده. پیلوټ په پنجابي او اردو کې دی؛ پاتې پاڼې به په اردو کې ښکاره شي.",
    lr_village: "ستاسو کلی / ځای",
    lr_accept: "منل",
    lr_decline: "ردول",
    lr_accepts: "ستاسو بیه یې ومنله",
    lr_counter: "بل وړاندیز",
    au_title_in: "ښه راغلاست",
    au_title_up: "خپل د اګري شېئر حساب جوړ کړئ",
    au_title_reset: "پاسورډ بیا تنظیم کړئ",
    au_sub: "د بکنګ، د بیې وړاندیز او د ماشین ثبتولو لپاره ننوځئ.",
    au_name: "بشپړ نوم",
    au_email: "ای میل",
    au_phone: "د موبایل شمېره",
    au_pass: "پاسورډ",
    au_pass2: "پاسورډ بیا ولیکئ",
    au_role: "زه یم",
    au_district: "ضلع",
    au_consent: "زه منم چې اګري شېئر زما نوم، ای میل، موبایل او ضلع یوازې د حساب چلولو لپاره ساتي (برخه 12.2).",
    au_create: "حساب جوړ کړئ",
    au_login: "ننوتل",
    au_have: "مخکې حساب لرئ؟",
    au_new: "اګري شېئر ته نوي یاست؟",
    au_forgot: "پاسورډ مو هېر دی؟",
    au_reset_btn: "نوی پاسورډ کېږدئ",

    au_back: "بېرته ننوتلو ته",
    au_err_name: "بشپړ نوم ولیکئ.",
    au_err_email: "سم ای میل ولیکئ.",
    au_err_pass: "پاسورډ باید لږ تر لږه 6 توري وي.",
    au_err_pass2: "پاسورډونه سره سمون نه خوري.",
    au_err_consent: "مهرباني وکړئ د محرمیت یادونه ومنئ.",
    au_err_wrong: "ای میل یا پاسورډ غلط دی.",
    au_err_none: "هېڅ حساب ونه موندل شو. لومړی نوم لیکنه وکړئ.",
    au_err_exists: "له دې لاګ‌ان څخه مخکې حساب جوړ شوی. مهرباني وکړئ ننوځئ.",
    au_err_taken: "دا ای میل مخکې ثبت شوی. مهرباني وکړئ ننوځئ.",
    au_err_generic: "یوه ستونزه پېښه شوه. بیا هڅه وکړئ.",
    au_need: "د دوام لپاره ننوځئ یا حساب جوړ کړئ.",
    au_local_note: "یوازې په دې براوزر کې خوندي شو (ګډ ریکارډونه دلته نشته).",
    toast_welcome: "ښه راغلاست، {name}!",
    toast_signedout: "تاسو ووتلئ.",
    toast_registered: "حساب جوړ شو. اګري شېئر ته ښه راغلاست!",
    toast_reset: "پاسورډ بدل شو. مهرباني وکړئ ننوځئ.",
    toast_booked: "د بکنګ غوښتنه مالک ته واستول شوه.",
    toast_offer: "د بیې وړاندیز مالک ته واستول شو.",
    toast_lr_booked: "له {owner} سره بکنګ تایید شو.",
    toast_listed: "وسپارل شو. د اګري شېئر ټیم له تایید وروسته به په بازار کې ښکاره شي.",
    toast_confirmed: "بکنګ تایید شو.",
    toast_declined: "بکنګ رد شو.",
    toast_completed: "کرایه بشپړه شوه.",
    toast_feedback: "نظر وسپارل شو.",
    toast_cancelled: "د بکنګ غوښتنه لغوه شوه.",
    toast_countered: "بل وړاندیز بزګر ته واستول شو.",
    toast_sold: "پلور تایید شو. {net} خالصه ګټه ستاسو والټ ته.",
    ab_name: "خپله بولي (خپله بیه ووایاست)",
    ab_tag: "خپل کرایه ووایاست، نږدې مالکان به وړاندیزونه درولېږي",
    vc_thinking: "پوهېږم…",
    vc_ready: "چمتو",
    vc_tap: "مایک کېکاږئ او خبرې وکړئ",
    vc_mic_blocked: "د مایک اجازه ونه شوه. په براوزر کې مایک ته اجازه ورکړئ، بیا د خبرو لپاره بیا کېکاږئ.",
    vc_no_speech: "هېڅ غږ وانه ورېدل شو — بیا هڅې لپاره مایک کېکاږئ.",
    vc_unsupported: "په دې براوزر کې غږیزې خبرې نه کېږي. په اندروید یا کمپیوټر کې کروم یا اېج وکاروئ، یا خپله پوښتنه ولیکئ.",
    vc_no_mic: "مایک ونه موندل شو. مایک ولګوئ، بیا د خبرو لپاره کېکاږئ.",
    vc_net: "د غږ پېژندلو لپاره انټرنېټ پکار دی. اړیکه وګورئ، بیا کېکاږئ.",
    vc_again: "بیا د خبرو لپاره کېکاږئ",
    vc_replay: "واورئ",
    vc_done_speaking: "خبرې مې پای ته ورسېدې"
  },
  bal: {
    role_buyer: "فصل ءِ گِرَوک",
    loc_title: "وتی جاگہ ءَ گچین کن",
    loc_village: "میتگ / چک / تحصیل",
    loc_save: "جاگہ ءَ ایر کن",
    loc_your: "وتی کِشار ءِ جاگہ",
    loc_farm: "کِشار ءِ جاگہ",
    vc_title: "زندگیں تواری کال",
    vc_start: "تواری کال ءَ بنا کن",
    vc_end: "تواری کال ءَ بند کن",
    vc_tap_btn: "گپ جنگ ءِ واستا بِجن",
    vc_you_said: "شما گُشت",
    nav_live: "درخواست دیم دئے",
    cta_live: "درخواست دیم دئے (وتی بولی)",
    nav_market: "مشینانی بازار",
    nav_bookings: "منی بکنگ",
    nav_owner: "واھند ءِ پورٹل",
    nav_agent: "ایگری ایجنٹ و USSD",
    tagline: "وسیلہاں بہر کن، ہمراہی ءَ دیم ءَ برو",
    hero_kicker: "پنجاب پائلٹ · ٹریکٹر · تھریشر · ہارویسٹر",
    hero_title: "مشین ءِ بہا گِرگ ضروری نہ اِنت، کرایہ ءَ بِگِر۔",
    hero_owner: "شمئے بیکار مشین کرایہ ءَ سرا کٹّ کنت۔",
    hero_desc: "وتی میتگ ءِ نزّیک ءَ ٹریکٹر، تھریشر و ہارویسٹر شوہاز کن، بکنگ ءَ پیسر ڈرائی رینٹ ءِ پوریں بہا بچار، و چند منٹ ءَ درخواست دیم دئے۔",
    cta_find: "مشین شوہاز کن",
    cta_list: "وتی مشین ءَ نبشتہ کن",
    stat_pilot: "پنجاب ءِ پائلٹ دَمگ",
    stat_radius: "کلومیٹر شوہاز",
    stat_comm: "پلیٹ فارم ءِ کمیشن",
    stat_cats: "مشینانی رنگ",
    how_title: "ایگری شیئر چون کار کنت",
    how1: "واھند وتی بیکار مشین ءَ نبشتہ کنت",
    how2: "بزگر 15 کلومیٹر ءَ شوہاز کنت",
    how3: "ڈرائی رینٹ ءِ پوریں بہا گندیت",
    how4: "واھند منّیت، کار بیت",
    filters: "فلٹر",
    f_category: "مشین ءِ رنگ",
    cat_all: "سجّہ",
    cat_tractor: "ٹریکٹر",
    cat_thresher: "تھریشر",
    cat_harvester: "ہارویسٹر",
    one_tractor: "ٹریکٹر",
    one_thresher: "تھریشر",
    one_harvester: "ہارویسٹر",
    f_district: "پنجاب ءِ ضلع",
    all_districts: "سجّہیں ضلع",
    f_radius: "شوہاز ءِ دائرہ",
    f_search: "مشین یا میتگ شوہاز کن",
    km: "کلومیٹر",
    radius_note: "ڈیفالٹ 15 کلومیٹر، گیشتر 25 کلومیٹر",
    results: "{n} مشین در کپت",
    no_results: "اے فلٹرانی سرا ہچ مشین در نہ کپت۔ شوہاز ءِ دائرہ ءَ مزن کن یا سجّہیں ضلعاں گچین کن۔",
    reset: "فلٹراں نوک کن",
    per_hour: "/ساعت",

    distance: "دور",
    dry_rent: "ڈرائی رینٹ: ڈیزل شامل نہ اِنت",
    op_included: "چلائوک (ڈرائیور) کرایہ ءَ شامل",
    op_optional: "چلائوک (ڈرائیور) وتی واہگ: +500 کلدار/ساعت",
    op_none: "چلائوک نیست: وتی ڈرائیور ءَ بیار",
    tr_included: "ٹرانسپورٹ شامل",
    tr_optional: "ٹرانسپورٹ وتی واہگ (100 کلدار فی کلومیٹر، کمّ ءِ کمّ 500)",
    tr_self: "ٹرانسپورٹ بزگر ءِ ذمہ",
    request: "بکنگ ءِ درخواست",
    unavailable: "اَنّوں نیست",
    owner: "واھند",
    new_badge: "نوکیں لِسٹ",
    bk_title: "بکنگ ءِ درخواست",
    bk_date: "کرایہ ءِ تاریخ",
    bk_hours: "کار ءِ ساعت",
    bk_operator: "چلائوک ءَ ہور کن",
    bk_transport: "ٹرانسپورٹ ءَ ہور کن",
    bk_breakdown: "بہا ءِ روشنیں ہساب",
    bk_base: "بُنّی ڈرائی رینٹ",
    bk_op: "چلائوک",
    bk_tr: "ٹرانسپورٹ",
    bk_sub: "کسانیں جمع",
    bk_comm: "پلیٹ فارم ءِ کمیشن ({p})",
    bk_total: "سجّہیں اندازی بہا",
    bk_fuel_line: "ڈیزل: بزگر دنت (بہا ءَ شامل نہ اِنت)",
    bk_ack: "من زانان کہ اے ڈرائی رینٹ اِنت: ڈیزل من دیاں، و گیشیں وہد و دیر ءَ پِر ترّینگ ءِ شرط منّگ ءَ پیسر واھند ءِ گوں گیشینگ بنت۔",
    bk_pay: "زرّ دیگ ءِ راہ",

    pay_easypaisa: "ایزی پیسہ",
    pay_jazzcash: "جاز کیش",
    pay_agent: "میتگ ءِ ایگری ایجنٹ ءِ دستا نغد",
    bk_name: "شمئے نام",
    bk_phone: "موبائل نمبر",
    bk_privacy: "تهنا اے بکنگ ءِ واستا کار بندگ بیت (بہر 12.2)۔",
    bk_submit: "بکنگ ءِ درخواست دیم دئے",
    cancel: "کنسل",
    close: "بند کن",
    included_word: "شامل",
    not_added: "ہور نہ اِنت",
    err_date: "کرایہ ءِ تاریخ گچین کن۔",
    err_name: "وتی نام نبشتہ کن۔",
    err_phone: "درستیں پاکستانی موبائل نمبر نبشتہ کن (03XXXXXXXXX)۔",
    err_ack: "مہربانی کن، ڈرائی رینٹ ءِ شرطاں بمنّ۔",
    st_sent: "درخواست دیم دئیگ بوت",
    st_confirmed: "واھند منّت",
    st_completed: "کرایہ سرجم بوت",
    st_feedback: "رائے دئیگ بوت",
    st_declined: "واھند نہ منّت",
    st_cancelled: "کنسل بوت",
    kh_title: "ایگری شیئر بزگر کمک کار",
    kh_short: "بزگر کمک کار",
    kh_placeholder: "ساعت، خرچ یا مشین ءِ بابت ءَ جُست کن...",
    kh_send: "دیم دئے",
    kh_hello: "السلام علیکم! من کرایہ ءِ ساعت و ڈرائی رینٹ ءِ خرچ ءِ اندازہ جت کناں، مشین ءِ گچین کنگ و ویب سائٹ ءِ کار بندگ ءَ کمک کناں۔ بلوچی، اردو یا انگریزی ءَ جُست کن۔",
    kh_ai: "Claude AI",
    kh_offline: "تہی کمک کار",
    kh_thinking: "پِگر کنگ ءَ اوں...",
    tr_fee: "ٹرانسپورٹ وتی واہگ: {km} کلومیٹر ءِ واستا +{fee}",
    bk_offer_toggle: "وتی بہا ءَ پیش کن",
    bk_offer_sub: "کرایہ گیش اِنت؟ واھند ءَ پیشکش دیم دئے۔ آ منّیت، دومی پیشکش دنت یا نہ منّیت۔",
    bk_offer_rate: "شمئے ساعت ءِ پیشکش (کلدار)",
    bk_offer_tr: "شمئے ٹرانسپورٹ ءِ پیشکش (کلدار)",
    bk_offer_note: "واھند ءِ واستا کلہو (وتی واہگ)",
    bk_offer_note_ph: "مثال: من تهنا 2 کلومیٹر دور آں، ٹرانسپورٹ ءَ کم کن؟",
    bk_offer_min: "پیشکش {min} و {max} ءِ نیام ءَ بہ بیت۔",
    bk_listed: "نبشتہ کتگیں",
    bk_your_offer: "شمئے پیشکش",
    bk_send_offer: "بہا ءِ پیشکش دیم دئے",
    st_countered: "واھند ءِ دومی پیشکش",
    nav_members: "باسک",
    auth_signin: "سائن ان",
    auth_signup: "سائن اپ",
    auth_signout: "سائن آؤٹ",
    role_renter: "بزگر / کرایہ گِروک",
    role_owner: "مشین ءِ واھند",
    role_agent: "ایگری ایجنٹ",
    nav_admin: "ایڈمن پینل",
    bk_smallholder: "کسانیں بزگر (5 ایکڑ ءَ کم)",
    bk_smallholder_sub: "عام 6% ءِ بدل ءَ 4% رعایتی کمیشن۔",
    pay_paylater: "انّوں رونگ، رند ءَ زرّ (انّوں 30% + رونگ ءَ رند 70%)",
    pl_now: "انّوں زرّ (30%)",
    pl_later: "رونگ ءَ رند (70%)",
    pl_partner: "وام ءِ ہمراہ (پیشنهادی)",
    pl_due: "70% پِر ترّینگ ءِ وہد",
    pl_days: "روچ",
    pl_due_on: "آخری تاریخ",
    pl_now_short: "انّوں",
    pl_risk: "70% سیمی دَپ ءِ مائیکروفنانس ہمراہ ءِ وام اِنت، پِر ترّینگ ءِ خطر آئی ءِ سرا اِنت۔ ایگری شیئر ءِ سرا وام ءِ ہچ خطر نیست۔ ہمراہانی نام تهنا پیشنهاد اَنت (ہچ معاہدہ نیست) و ہمراہ ءِ فیس کپت کنت۔",
    pl_settled: "دئیگ بوت",
    pl_pending: "70% پشت کپتگ",
    pl_settled_by: "ایگری منڈی ءِ بہا {id} ءَ چہ وت ءَ دئیگ بوت۔",
    pl_settle_mandi: "ایگری منڈی ءَ کِشت ءِ بہا کنگ ءَ گوں بدئے",
    kp_title: "سمارٹ فون نیست؟ سادگیں فون ءَ گوں بکنگ کن",
    kp_sub: "ہر سادگیں فون ءَ چہ مُفتیں ہیلپ لائن ءَ کال کن یا USSD کوڈ ءَ جن۔ پنجابی یا اردو توار گام پہ گام راہشونی کنت، و بکنگ ءِ منّگ SMS ءَ کئیت۔",
    kp_toll: "مُفتیں ہیلپ لائن",
    kp_ussd: "USSD کوڈ",

    kp_ivr: "IVR ءِ توار ءِ گام گوش دار",

    kp_ivr_pa: "پنجابی IVR",
    kp_ivr_ur: "اردو IVR",
    nav_mandi: "ایگری منڈی",
    am_title: "ایگری منڈی: وتی کِشت ءَ بہا کن",
    am_sub: "وتی کِشت و بہا ءَ دیم دئے۔ نبشتہ کتگیں آرت ءِ مِل، برنج ءِ مِل و مزنیں گِروک شمئے بہا ءِ سرا زندگیں بولی جن اَنت۔ گہتریں پیشکش ءَ گچین کن۔",
    am_credit: "شمئے پشت کپتگیں مشین ءِ وام (70%)",
    am_credit_n: "بکنگ انّوں رونگ، رند ءَ زرّ ءِ سرا",
    am_closed_loop: "بند حلقہ ءِ ہساب",
    am_closed_title: "شمئے کِشت ءِ بہا شمئے مشین ءِ وام ءَ وت ءَ دنت",
    am_loop1: "تهنا 30% پیسرا دئیگ ءَ گوں مشین ءَ کرایہ ءَ بگر",
    am_loop2: "وتی کِشت ءَ رون",
    am_loop3: "ایگری منڈی ءَ منّتگیں گِروک ءَ بہا کن",
    am_loop4: "پشت کپتگیں 70% ہمراہ ءَ دئیگ بیت و شمئے خالصیں کٹّ جاز کیش یا ایزی پیسہ ءَ رَوت",
    am_crop: "کِشت",
    crop_wheat: "گندم",
    crop_rice: "برنج",
    crop_maize: "جُوار",
    crop_cotton: "کپاس",
    am_qty: "کچ (من، 40 کلو)",
    am_grade: "جوانی",
    am_grade_a: "درجہ A (پاک، ہشک)",
    am_grade_b: "درجہ B",
    am_rate: "شمئے امیتیں بہا (کلدار فی من)",
    am_bench_src: "بازار ءِ راہشونی: نزّیکا {r} فی من (پنجاب ءِ نوکیں رپوٹانی سرا)۔",
    am_bench_est: "بازار ءِ راہشونی: نزّیکا {r} فی من (اندازی)۔",
    am_expected_total: "امیتیں سجّہیں زرّ",
    am_wallet: "زرّ گِر",
    am_wallet_no: "والٹ ءِ موبائل نمبر",
    am_post: "کِشت ءَ دیم دئے و بولی بگر",
    am_new: "نوکیں بہا",
    am_recent: "شمئے نوکیں کِشت",
    am_mann: "من",
    am_st_open: "پچ",
    am_st_sold: "بہا بوت",
    am_st_closed: "بند",
    am_bids: "گِروکانی زندگیں بولی",
    am_waiting: "گِروک بولی جن اَنت...",
    am_bids_n: "بولی",
    am_idle: "مِل و مزنیں گِروکانی بولی ءِ واستا وتی کِشت ءَ دیم دئے۔",
    am_no_bids: "ہچ گِروک شمئے بہا ءِ سرا نیاتک۔ کمّے کمیں بہا یا نوکیں پوسٹ ءَ آزمائش کن۔",
    am_type_flour: "آرت ءِ مِل",
    am_type_rice: "برنج ءِ مِل",
    am_type_feed: "فیڈ / نشاستہ ءِ مِل",
    am_type_ginning: "جننگ کارخانگ",
    am_type_bulk: "مزنیں گِروک",
    am_sample: "نمونہیں گِروک",
    am_above: "شمئے بہا ءَ گیشیں بولی",
    am_pickup: "گِروک کشار ءَ چہ زوریت",
    am_settlement: "ہساب ءِ چارگ",
    am_gross: "کِشت ءِ بہا",
    am_minus_credit: "مشین ءِ وام پِر ترّینگ بوت (70%)",
    am_unsettled: "{v} وام پشت کپیت، چیا کہ اے بہا آئی ءَ پوریں نہ کنت۔",
    am_net: "شمئے خالصیں کٹّ",

    am_confirm: "بہا ءَ بمنّ",
    am_done: "بہا منّگ بوت و ہساب سرجم بوت۔",
    am_sold_to: "گِروک",

    exp_note: "بلوچی پراہی ءِ پیشی چارگ اِنت۔ پائلٹ پنجابی و اردو ءَ اِنت؛ دگہ تاک اردو ءَ پیش دارگ بنت۔",
    lr_village: "شمئے میتگ / جاگہ",
    lr_accept: "بمنّ",
    lr_decline: "نہ منّ",
    lr_accepts: "شمئے بہا ءَ منّیت",
    lr_counter: "دومی پیشکش",
    au_title_in: "وش آتکے",
    au_title_up: "وتی ایگری شیئر ءِ اکاؤنٹ ءَ جوڑ کن",
    au_title_reset: "پاس ورڈ ءَ نوک کن",
    au_sub: "بکنگ، بہا ءِ پیشکش و مشین ءِ نبشتہ کنگ ءِ واستا سائن ان کن۔",
    au_name: "پوریں نام",
    au_email: "ای میل",
    au_phone: "موبائل نمبر",
    au_pass: "پاس ورڈ",
    au_pass2: "پاس ورڈ ءَ پدا نبشتہ کن",
    au_role: "من آں",
    au_district: "ضلع",
    au_consent: "من منّاں کہ ایگری شیئر منی نام، ای میل، موبائل و ضلع ءَ تهنا اکاؤنٹ ءِ چلائینگ ءِ واستا داریت (بہر 12.2)۔",
    au_create: "اکاؤنٹ جوڑ کن",
    au_login: "سائن ان",
    au_have: "پیسرا اکاؤنٹ ہست؟",
    au_new: "ایگری شیئر ءَ نوک اِت؟",
    au_forgot: "پاس ورڈ شموشت؟",
    au_reset_btn: "نوکیں پاس ورڈ بِل",

    au_back: "سائن ان ءَ پِر بتر",
    au_err_name: "پوریں نام نبشتہ کن۔",
    au_err_email: "درستیں ای میل نبشتہ کن۔",
    au_err_pass: "پاس ورڈ کمّ ءِ کمّ 6 حرف بہ بیت۔",
    au_err_pass2: "پاس ورڈ یک وڑیں نہ اَنت۔",
    au_err_consent: "مہربانی کن، پرائیویسی ءِ نوٹ ءَ بمنّ۔",
    au_err_wrong: "ای میل یا پاس ورڈ رد اِنت۔",
    au_err_none: "ہچ اکاؤنٹ در نہ کپت۔ پیسرا سائن اپ کن۔",
    au_err_exists: "اے لاگ ان ءَ چہ پیسرا اکاؤنٹ جوڑ اِنت۔ سائن ان کن۔",
    au_err_taken: "اے ای میل پیسرا نبشتہ اِنت۔ سائن ان کن۔",
    au_err_generic: "چیزے رد بوت۔ پدا آزمائش کن۔",
    au_need: "دیم ءَ رئوگ ءِ واستا سائن ان کن یا اکاؤنٹ جوڑ کن۔",
    au_local_note: "تهنا اے براؤزر ءَ داشتگ بوت (ہوریں ریکارڈ ادا نیست)۔",
    toast_welcome: "وش آتکے، {name}!",
    toast_signedout: "شما سائن آؤٹ بوتت۔",
    toast_registered: "اکاؤنٹ جوڑ بوت۔ ایگری شیئر ءَ وش آتکے!",
    toast_reset: "پاس ورڈ بدل بوت۔ سائن ان کن۔",
    toast_booked: "بکنگ ءِ درخواست واھند ءَ دیم دئیگ بوت۔",
    toast_offer: "بہا ءِ پیشکش واھند ءَ دیم دئیگ بوت۔",
    toast_lr_booked: "{owner} ءِ گوں بکنگ منّگ بوت۔",
    toast_listed: "دیم دئیگ بوت۔ ایگری شیئر ءِ ٹیم ءِ منّگ ءَ رند بازار ءَ پیش دارگ بیت۔",
    toast_confirmed: "بکنگ منّگ بوت۔",
    toast_declined: "بکنگ نہ منّگ بوت۔",
    toast_completed: "کرایہ سرجم بوت۔",
    toast_feedback: "رائے دئیگ بوت۔",
    toast_cancelled: "بکنگ ءِ درخواست کنسل بوت۔",
    toast_countered: "دومی پیشکش بزگر ءَ دیم دئیگ بوت۔",
    toast_sold: "بہا منّگ بوت۔ {net} خالصیں کٹّ شمئے والٹ ءَ۔",
    ab_name: "وتی بولی (وتی نرخ ءَ بگوش)",
    ab_tag: "وتی کرایہ ءَ بگوش، نزّیکیں واہند آفر رَوان دئینت",
    vc_listening: "گوش دارگ اِیں… گپ جن",
    vc_thinking: "سرپد بوگ اِیں…",
    vc_speaking: "گپ جنگ اِیں…",
    vc_ready: "تیار",
    vc_tap: "مائیک ءَ بِجن و گپ جن",
    vc_mic_blocked: "مائیک ءِ اجازت نہ رستگ۔ براؤزر ءِ سیٹنگ ءَ مائیک ءَ اجازت بدئے، پدا گپ جنگ ءِ واستا بِجن۔",
    vc_no_speech: "ہچ توار گوش نہ بوت — پدا کوشست ءِ واستا مائیک ءَ بِجن۔",
    vc_unsupported: "اے براؤزر ءَ توار ءِ سرا گپ نہ بیت۔ اینڈرائیڈ یا کمپیوٹر ءَ کروم یا ایج کار بند، یا وتی جُست ءَ بنویس۔",
    vc_no_mic: "مائیک در نہ کپت۔ مائیک ءَ لگئے، پدا بِجن۔",
    vc_net: "توار ءِ پجّار ءِ واستا انٹرنیٹ پکار انت۔ کنکشن ءَ بچار، پدا بِجن۔",
    vc_again: "پدا گپ جنگ ءِ واستا بِجن",
    vc_replay: "گوش کن",
    vc_done_speaking: "منی گپ ہلاس بوت"
  },
};

const DISTRICT_NAMES = {
  ur: { "Lahore Rural": "لاہور دیہی", Kasur: "قصور", Sheikhupura: "شیخوپورہ", Okara: "اوکاڑہ", Faisalabad: "فیصل آباد", Sahiwal: "ساہیوال" },
  pa: { "Lahore Rural": "لہور پینڈو", Kasur: "قصور", Sheikhupura: "شیخوپورہ", Okara: "اوکاڑہ", Faisalabad: "فیصل آباد", Sahiwal: "ساہیوال" },
  sd: { "Lahore Rural": "لاهور ٻهراڙي", Kasur: "قصور", Sheikhupura: "شيخوپورو", Okara: "اوڪاڙو", Faisalabad: "فيصل آباد", Sahiwal: "ساهيوال" },
  ps: { "Lahore Rural": "لاهور کلیوال", Kasur: "قصور", Sheikhupura: "شیخوپوره", Okara: "اوکاړه", Faisalabad: "فیصل اباد", Sahiwal: "ساهیوال" },
  bal: { "Lahore Rural": "لاہور ءِ دیہات", Kasur: "قصور", Sheikhupura: "شیخوپورہ", Okara: "اوکاڑہ", Faisalabad: "فیصل آباد", Sahiwal: "ساہیوال" },
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const store = {
  get(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  },
};

// Amounts are stored in PKR; shown in the selected country's currency
const pkr = (n) => (CUR.id === "PK" ? "PKR " + Math.round(Number(n) || 0).toLocaleString("en-PK") : fmtLocal((Number(n) || 0) * CUR.fx));
const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const addDaysISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const fmtDate = (iso) => {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch (e) { return iso; }
};
const newBookingId = () => "AS-" + Math.floor(10000 + Math.random() * 89999);

// terms (optional) = negotiated { rate, transport } that replace the listed values
function quote(listing, hours, wantOperator, wantTransport, terms, commissionRate = COMMISSION) {
  const h = Math.max(1, Number(hours) || 1);
  const rate = terms && terms.rate ? Number(terms.rate) : listing.rate;
  const trFee = terms && terms.transport != null ? Number(terms.transport) : transportFee(listing.distance);
  const base = rate * h;
  const operator = listing.operator === "optional" && wantOperator ? OPERATOR_RATE * h : 0;
  const transport = listing.transport === "optional" && wantTransport ? trFee : 0;
  const subtotal = base + operator + transport;
  const commission = Math.round(subtotal * commissionRate);
  return { hours: h, rate, listedRate: listing.rate, base, operator, transport, subtotal, commission, commissionRate, total: subtotal + commission };
}

const CategoryIcon = ({ category, className }) => {
  if (category === "tractor") return <Tractor className={className} aria-hidden="true" />;
  if (category === "thresher") return <Fan className={className} aria-hidden="true" />;
  if (category === "leveler") return <Ruler className={className} aria-hidden="true" />;
  if (category === "planter") return <Sprout className={className} aria-hidden="true" />;
  if (category === "drone") return <Drone className={className} aria-hidden="true" />;
  if (category === "implement") return <Shovel className={className} aria-hidden="true" />;
  return <Wheat className={className} aria-hidden="true" />;
};

/* Machine photo with a drawn fallback (offline, blocked or missing image) */
function MachineArt({ category, className = "", label }) {
  const uid = "ma" + category;
  return (
    <div role="img" aria-label={label || category} className={`relative overflow-hidden ${className}`}>
      <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id={uid + "s"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d7340" /><stop offset="1" stopColor="#67A834" /></linearGradient>
          <linearGradient id={uid + "f"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E6B325" /><stop offset="1" stopColor="#c9961a" /></linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#${uid}s)`} />
        <circle cx="262" cy="42" r="20" fill="#E6B325" opacity="0.9" />
        <circle cx="262" cy="42" r="32" fill="#E6B325" opacity="0.15" />
        <path d="M0 112 Q80 92 160 108 T320 100 V180 H0Z" fill="#145A32" opacity="0.55" />
        <path d="M0 128 Q90 112 170 126 T320 120 V180 H0Z" fill={`url(#${uid}f)`} />
        {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M${160 + (i - 4) * 6} 126 L${160 + (i - 4) * 70} 180`} stroke="#5C3A21" strokeOpacity="0.22" strokeWidth="2" />)}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-lg ring-1 ring-white/40 backdrop-blur-md"><CategoryIcon category={category} className="h-9 w-9 text-white drop-shadow" /></span>
      </div>
    </div>
  );
}
// priority: "high" for the hero (LCP image), "eager" for other above-the-fold images, otherwise lazy
function MachinePhoto({ category, name, className = "", alt, priority, width = 640, height = 360 }) {
  const key = photoKeyFor(category, name);
  const info = key ? MACHINE_PHOTOS[key] : null;
  const src = info ? info.src || commonsUrl(info.file, 640) : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <MachineArt category={category} className={className} label={alt || name} />;
  return <img src={src} alt={alt || name || info.label} title={`${info.label} · ${info.credit} (Wikimedia Commons)`} width={width} height={height}
    loading={priority ? "eager" : "lazy"} decoding={priority === "high" ? "sync" : "async"} fetchpriority={priority === "high" ? "high" : priority ? "auto" : "low"}
    onError={() => setFailed(true)} className={`bg-forest/20 object-cover ${className}`} />;
}

/* Number input in the selected country's currency; reads and writes PKR */
function MoneyInput({ value, onChange, min, max, step, id, className, ...rest }) {
  const toTxt = (v) => { if (v === "" || v == null) return ""; const l = toLocal(v); return String(Math.abs(l) >= 100 ? Math.round(l) : l); };
  const [txt, setTxt] = useState(toTxt(value));
  const last = useRef(value);
  const curRef = useRef(CUR.id);
  useEffect(() => {
    if (value !== last.current || curRef.current !== CUR.id) { setTxt(toTxt(value)); last.current = value; curRef.current = CUR.id; }
  }); // eslint-disable-line
  const conv = (v) => (v == null || v === "" ? undefined : CUR.id === "PK" ? v : Math.round(toLocal(v)));
  return (
    <input id={id} type="number" inputMode="decimal" dir="ltr" value={txt} min={conv(min)} max={conv(max)} step="any" data-step={step} className={className}
      onChange={(e) => { setTxt(e.target.value); const v = e.target.value === "" ? "" : fromLocal(e.target.value); last.current = v; onChange(v); }} {...rest} />
  );
}

function CountrySelect({ t, country, setCountry, id = "country", compact }) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-forest/15 bg-white px-2 py-1.5" title={t("fx_note")}>
      <Globe className="h-4 w-4 text-forest" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">{t("country")}</label>
      <select id={id} value={country} onChange={(e) => setCountry(e.target.value)} className="max-w-[11rem] bg-transparent text-sm font-semibold text-forest focus:outline-none">
        {COUNTRY_IDS.map((cc) => <option key={cc} value={cc}>{t("country_" + cc)}{compact ? "" : ` · ${COUNTRIES[cc].code}`}</option>)}
      </select>
    </div>
  );
}

const STATUS_FLOW = ["sent", "confirmed", "completed", "feedback"];

/* ------------------------------------------------------------------ */
/* All-Pakistan locations: provinces, major agricultural districts,    */
/* map pin-drop and GPS. Coordinates are approximate district centres. */
/* Map outline: Natural Earth (public domain) via world-atlas.         */
/* ------------------------------------------------------------------ */
const PROVINCES = ["PB", "SD", "KP", "BA", "GB", "AJK", "ICT"];
const PROVINCE_NAMES = {
  en: { PB: "Punjab", SD: "Sindh", KP: "Khyber Pakhtunkhwa", BA: "Balochistan", GB: "Gilgit-Baltistan", AJK: "Azad Jammu & Kashmir", ICT: "Islamabad Capital Territory" },
  ur: { PB: "پنجاب", SD: "سندھ", KP: "خیبر پختونخوا", BA: "بلوچستان", GB: "گلگت بلتستان", AJK: "آزاد جموں و کشمیر", ICT: "اسلام آباد" },
  pa: { PB: "پنجاب", SD: "سندھ", KP: "خیبر پختونخوا", BA: "بلوچستان", GB: "گلگت بلتستان", AJK: "آزاد جموں و کشمیر", ICT: "اسلام آباد" },
  sd: { PB: "پنجاب", SD: "سنڌ", KP: "خيبر پختونخوا", BA: "بلوچستان", GB: "گلگت بلتستان", AJK: "آزاد جموں ۽ ڪشمير", ICT: "اسلام آباد" },
  ps: { PB: "پنجاب", SD: "سند", KP: "خیبر پښتونخوا", BA: "بلوچستان", GB: "ګلګت بلتستان", AJK: "آزاد جموں او کشمیر", ICT: "اسلام اباد" },
  bal: { PB: "پنجاب", SD: "سندھ", KP: "خیبر پختونخوا", BA: "بلوچستان", GB: "گلگت بلتستان", AJK: "آزاد جموں و کشمیر", ICT: "اسلام آباد" },
};
const PROVINCE_COLORS = { PB: "#145A32", SD: "#B7791F", KP: "#2F7D32", BA: "#5C3A21", GB: "#3B6E8F", AJK: "#7A4E9A", ICT: "#C0392B" };
const PK_DISTRICTS = [
  // Punjab
  ["Lahore", "PB", 31.55, 74.34], ["Kasur", "PB", 31.12, 74.45], ["Sheikhupura", "PB", 31.71, 73.98], ["Okara", "PB", 30.81, 73.45], ["Faisalabad", "PB", 31.42, 73.08],
  ["Sahiwal", "PB", 30.66, 73.11], ["Multan", "PB", 30.2, 71.47], ["Bahawalpur", "PB", 29.4, 71.68], ["Rahim Yar Khan", "PB", 28.42, 70.3], ["Sargodha", "PB", 32.08, 72.67],
  ["Gujranwala", "PB", 32.16, 74.19], ["Sialkot", "PB", 32.49, 74.53], ["Gujrat", "PB", 32.57, 74.08], ["Jhang", "PB", 31.27, 72.32], ["Toba Tek Singh", "PB", 30.97, 72.48],
  ["Vehari", "PB", 30.04, 72.35], ["Khanewal", "PB", 30.3, 71.93], ["Bahawalnagar", "PB", 29.99, 73.25], ["Dera Ghazi Khan", "PB", 30.05, 70.63], ["Muzaffargarh", "PB", 30.07, 71.19],
  ["Layyah", "PB", 30.96, 70.94], ["Bhakkar", "PB", 31.63, 71.06], ["Mianwali", "PB", 32.58, 71.54], ["Rawalpindi", "PB", 33.6, 73.04], ["Attock", "PB", 33.77, 72.36],
  ["Jhelum", "PB", 32.94, 73.73], ["Chakwal", "PB", 32.93, 72.86], ["Hafizabad", "PB", 32.07, 73.69], ["Mandi Bahauddin", "PB", 32.58, 73.49], ["Narowal", "PB", 32.1, 74.87],
  ["Pakpattan", "PB", 30.34, 73.39], ["Lodhran", "PB", 29.54, 71.63], ["Rajanpur", "PB", 29.1, 70.33], ["Khushab", "PB", 32.3, 72.35], ["Nankana Sahib", "PB", 31.45, 73.71], ["Chiniot", "PB", 31.72, 72.98],
  // Sindh
  ["Karachi", "SD", 24.86, 67.01], ["Hyderabad", "SD", 25.4, 68.37], ["Sukkur", "SD", 27.71, 68.85], ["Larkana", "SD", 27.56, 68.21], ["Shaheed Benazirabad (Nawabshah)", "SD", 26.24, 68.41],
  ["Mirpurkhas", "SD", 25.53, 69.01], ["Khairpur", "SD", 27.53, 68.76], ["Dadu", "SD", 26.73, 67.78], ["Jacobabad", "SD", 28.28, 68.44], ["Ghotki", "SD", 28.01, 69.32],
  ["Sanghar", "SD", 26.05, 68.95], ["Badin", "SD", 24.66, 68.84], ["Thatta", "SD", 24.75, 67.92], ["Umerkot", "SD", 25.36, 69.74], ["Shikarpur", "SD", 27.96, 68.64],
  ["Tando Allahyar", "SD", 25.46, 68.72], ["Naushahro Feroze", "SD", 26.84, 68.12], ["Matiari", "SD", 25.6, 68.45],
  // Khyber Pakhtunkhwa
  ["Peshawar", "KP", 34.01, 71.58], ["Mardan", "KP", 34.2, 72.04], ["Swat", "KP", 34.77, 72.36], ["Dera Ismail Khan", "KP", 31.83, 70.9], ["Charsadda", "KP", 34.15, 71.74],
  ["Nowshera", "KP", 34.02, 71.98], ["Swabi", "KP", 34.12, 72.47], ["Bannu", "KP", 32.99, 70.6], ["Kohat", "KP", 33.59, 71.44], ["Abbottabad", "KP", 34.15, 73.21],
  ["Mansehra", "KP", 34.33, 73.2], ["Lakki Marwat", "KP", 32.61, 70.91], ["Malakand", "KP", 34.57, 71.93], ["Haripur", "KP", 33.99, 72.93], ["Chitral", "KP", 35.85, 71.79],
  // Balochistan
  ["Quetta", "BA", 30.18, 67.0], ["Nasirabad", "BA", 28.55, 68.22], ["Jaffarabad", "BA", 28.38, 68.35], ["Khuzdar", "BA", 27.81, 66.61], ["Sibi", "BA", 29.54, 67.88],
  ["Loralai", "BA", 30.37, 68.6], ["Kech (Turbat)", "BA", 26.0, 63.04], ["Gwadar", "BA", 25.12, 62.33], ["Lasbela", "BA", 25.81, 66.62], ["Zhob", "BA", 31.34, 69.45],
  ["Pishin", "BA", 30.58, 67.0], ["Kalat", "BA", 29.03, 66.59], ["Jhal Magsi", "BA", 28.28, 67.45], ["Kachhi (Bolan)", "BA", 29.45, 67.65], ["Mastung", "BA", 29.8, 66.85], ["Panjgur", "BA", 26.97, 64.09],
  // Gilgit-Baltistan
  ["Gilgit", "GB", 35.92, 74.31], ["Skardu", "GB", 35.3, 75.63], ["Hunza", "GB", 36.32, 74.66], ["Ghizer", "GB", 36.18, 73.77], ["Ghanche", "GB", 35.18, 76.33], ["Astore", "GB", 35.37, 74.86], ["Diamer", "GB", 35.42, 74.1],
  // Azad Jammu & Kashmir
  ["Muzaffarabad", "AJK", 34.37, 73.47], ["Mirpur", "AJK", 33.15, 73.75], ["Bhimber", "AJK", 32.97, 74.08], ["Kotli", "AJK", 33.52, 73.9], ["Bagh", "AJK", 33.98, 73.78], ["Poonch (Rawalakot)", "AJK", 33.86, 73.76], ["Neelum", "AJK", 34.59, 73.91],
  // Islamabad
  ["Islamabad", "ICT", 33.69, 73.05],
].map(([name, province, lat, lng]) => ({ name, province, lat, lng }));

const PK_MAP_PATH = "M566.9,69.5L568.5,73.1L570.9,78.6L572.5,82.1L574.3,86.1L575.1,88.1L576.8,91.6L576.1,93.5L575.0,96.3L571.3,98.4L567.5,100.0L566.7,100.9L566.3,102.1L564.5,104.5L561.1,106.5L558.1,106.3L556.2,105.8L546.3,109.3L541.8,109.2L538.2,111.5L535.6,113.6L530.4,115.9L526.8,115.9L521.4,114.5L514.9,112.0L512.3,110.4L509.9,110.5L504.1,110.2L498.4,108.9L491.7,107.4L488.3,106.7L481.5,105.4L477.1,107.2L473.0,108.8L469.8,109.9L467.0,114.8L465.9,116.6L464.7,119.1L464.0,120.9L464.5,123.0L468.5,124.5L470.1,126.5L470.4,128.4L469.0,130.2L467.8,131.7L467.8,133.0L468.4,134.3L469.4,135.2L475.0,135.9L478.4,135.9L479.6,136.4L479.9,138.1L478.6,140.5L473.9,142.4L471.1,144.5L470.3,147.2L470.4,149.3L471.3,150.7L473.5,152.3L475.6,154.2L476.4,155.7L476.0,157.8L475.3,160.6L472.9,164.0L470.9,166.3L470.8,167.2L471.3,168.4L472.8,170.3L475.5,173.0L478.9,175.2L481.0,175.8L481.6,176.3L482.4,178.9L482.6,181.5L481.7,183.6L483.4,185.2L487.8,185.2L491.5,185.8L493.1,185.2L494.1,185.7L493.5,191.7L494.0,195.2L494.8,196.3L498.4,197.7L505.3,197.5L509.4,199.2L513.9,201.1L516.3,203.3L517.3,204.8L517.0,207.4L514.5,210.4L510.5,211.8L508.2,212.4L496.7,218.1L493.1,220.4L490.3,223.3L489.3,225.4L488.8,227.5L491.2,235.0L491.7,237.4L489.6,245.6L489.1,248.6L489.8,250.7L492.2,251.5L492.8,253.3L493.1,254.6L488.7,257.6L484.4,260.3L482.9,260.3L478.6,265.2L471.4,275.2L467.6,278.6L467.4,280.2L467.0,281.9L468.5,284.7L468.8,287.1L467.1,289.5L464.5,292.3L459.3,294.7L452.7,297.2L449.7,298.6L447.4,305.1L445.4,311.6L444.4,314.0L441.0,321.5L434.7,332.4L433.1,334.9L423.5,340.1L413.6,345.9L411.9,348.1L409.9,353.3L408.0,359.1L406.3,362.2L400.1,368.9L397.9,374.1L397.3,377.5L392.1,379.4L386.0,381.2L377.2,381.8L373.6,382.7L362.9,387.4L360.1,387.6L358.2,386.8L356.5,385.2L355.0,382.6L354.3,378.5L352.3,376.7L349.4,375.1L346.6,375.0L343.6,376.7L341.1,378.6L339.3,380.2L337.6,382.0L334.3,388.2L329.0,397.1L323.0,403.5L320.9,405.4L319.5,406.9L317.6,409.0L316.5,411.1L315.0,417.8L314.3,423.8L314.6,425.1L315.5,426.3L318.7,428.1L323.4,430.9L329.5,432.6L334.6,432.8L336.6,434.1L337.7,435.8L337.9,437.2L337.7,442.1L337.2,447.4L335.2,453.1L335.3,456.4L336.1,459.6L341.7,467.7L343.8,468.5L348.0,468.7L350.0,468.6L352.3,467.8L353.9,468.3L355.0,469.3L355.3,471.0L355.2,479.1L356.9,482.8L360.3,487.8L363.0,493.5L365.5,500.3L367.9,505.7L368.9,508.5L367.3,509.9L366.4,511.2L366.1,513.1L366.5,515.1L366.3,516.5L367.4,518.3L368.8,518.8L368.8,520.0L366.6,521.6L364.8,521.5L363.3,522.2L360.4,525.5L359.1,526.2L357.4,526.5L355.4,526.2L352.7,524.9L351.8,522.8L352.2,520.5L351.5,519.3L349.5,519.5L342.6,521.7L336.0,524.5L334.8,526.4L333.3,528.3L330.2,529.2L325.9,529.4L322.7,529.1L319.9,527.0L317.2,525.1L313.3,525.0L306.0,525.3L302.0,525.3L299.7,524.6L297.4,525.1L294.4,524.3L293.2,525.3L291.9,525.4L290.9,523.6L290.3,523.5L289.6,523.7L288.9,524.3L288.4,525.3L288.3,537.4L283.6,537.4L280.2,537.3L276.5,538.0L273.1,538.9L271.4,540.0L269.0,541.7L268.5,544.1L267.2,545.9L265.6,543.3L264.5,542.1L263.4,543.0L261.6,542.8L258.4,539.9L257.0,542.9L251.8,543.5L251.2,541.3L251.0,539.2L248.2,540.8L246.0,538.4L245.2,535.3L244.4,534.4L243.4,533.4L241.3,532.4L239.3,529.0L239.2,525.5L238.7,521.3L234.6,505.8L232.1,504.3L218.4,501.6L217.6,498.8L218.6,491.5L218.2,486.9L213.7,480.8L212.5,476.6L208.9,473.0L205.3,471.9L201.5,472.4L199.6,473.8L198.5,476.2L206.4,475.7L208.1,476.6L210.2,478.2L208.0,478.1L205.4,477.4L202.1,477.4L189.9,479.2L182.9,481.8L173.5,481.0L161.5,483.5L151.6,483.7L147.5,488.6L145.3,487.8L143.5,486.5L129.9,482.6L129.1,481.0L126.8,479.9L124.3,481.9L122.5,482.3L115.1,480.6L109.4,481.9L107.2,484.1L107.1,487.6L100.0,486.9L96.0,485.8L90.6,487.0L78.4,485.4L75.3,485.8L70.8,488.1L69.0,489.9L66.3,490.6L64.1,488.1L62.3,487.0L60.7,487.7L58.5,489.8L52.2,490.8L46.5,490.5L40.4,488.5L41.1,487.9L42.1,484.6L43.0,472.6L44.0,468.3L43.8,466.0L44.0,465.3L46.4,463.1L46.9,462.3L47.9,456.2L48.9,449.4L50.0,446.9L50.9,446.3L58.5,443.3L59.8,441.2L63.7,441.7L64.1,441.2L64.5,438.9L66.2,436.4L68.8,434.3L70.7,433.5L77.4,432.2L81.4,430.4L82.7,430.3L93.3,430.7L95.5,430.0L95.9,429.4L96.5,422.5L98.4,421.4L98.8,420.8L98.1,416.0L98.5,412.9L100.6,411.0L100.5,409.9L99.0,407.7L96.9,406.3L95.9,405.9L87.2,407.3L83.5,406.8L81.8,406.0L81.5,405.3L81.8,404.0L81.9,401.7L83.2,398.2L83.5,396.1L82.5,384.0L81.0,375.9L81.8,367.9L81.7,366.3L81.4,365.9L80.3,365.9L74.9,366.6L70.4,361.5L67.7,359.4L60.0,356.9L56.6,356.4L51.6,354.2L47.0,349.3L42.4,344.3L40.5,341.2L38.4,335.8L32.5,325.4L32.5,322.7L31.8,321.1L26.1,314.3L21.9,309.5L15.3,301.7L28.5,306.0L38.9,309.4L55.5,314.8L68.3,319.0L71.9,319.7L109.7,316.0L123.7,318.8L128.2,320.4L128.8,319.5L130.7,317.6L133.9,315.7L138.3,314.2L142.8,313.4L149.1,313.3L153.4,313.4L156.5,313.9L162.6,313.6L165.6,312.9L175.7,309.9L182.4,307.9L192.7,304.9L200.1,302.6L202.0,301.4L203.9,299.2L204.9,297.2L202.5,294.2L202.3,291.6L203.8,288.3L204.6,283.1L204.4,275.9L203.9,271.7L206.0,263.9L207.8,259.5L211.2,257.4L213.6,256.1L214.6,255.2L215.6,254.2L219.3,248.2L222.7,245.4L226.0,243.8L229.6,244.0L232.7,246.3L238.6,247.3L244.3,246.6L249.3,244.9L251.5,243.5L254.1,242.2L254.0,240.8L251.0,239.6L249.3,237.9L248.7,235.7L250.4,234.5L254.3,234.0L263.9,228.9L267.7,225.5L268.9,223.9L270.7,223.7L274.3,225.3L278.6,225.8L281.3,224.2L283.9,223.9L286.6,225.6L287.9,227.7L290.4,230.2L293.4,230.6L297.0,229.3L300.8,226.5L304.4,222.4L307.6,218.6L306.8,206.1L306.3,198.6L308.0,194.8L310.4,192.4L312.0,188.7L311.9,185.4L313.6,182.7L315.3,175.2L317.6,173.4L322.2,172.2L329.8,171.5L335.7,168.1L341.6,164.5L342.4,161.3L340.2,157.8L337.2,151.2L334.5,147.2L328.0,140.1L328.7,135.7L332.3,133.9L341.3,137.0L343.8,137.6L346.9,138.0L355.2,137.9L361.9,136.8L369.0,134.0L370.4,131.2L370.2,127.9L370.4,125.1L370.5,121.2L368.0,118.8L366.5,116.5L366.0,114.8L367.8,113.8L369.5,112.0L371.1,108.8L375.0,104.8L377.4,101.3L379.6,99.6L383.0,97.3L385.1,94.0L386.1,92.0L388.1,90.0L388.7,88.7L388.2,87.5L387.2,86.1L386.1,84.5L386.1,82.9L387.0,81.2L388.0,79.7L387.6,77.6L387.0,74.1L385.2,72.1L384.0,67.4L382.0,62.7L381.0,60.8L379.1,58.4L374.9,56.0L373.6,54.3L375.2,51.1L378.0,49.1L383.2,44.3L386.1,40.9L388.7,38.6L392.1,38.9L393.9,38.7L395.7,36.6L399.1,34.6L405.2,30.6L407.3,27.9L410.5,26.6L413.1,26.3L416.8,25.4L420.3,23.9L423.4,22.8L428.4,22.6L436.2,22.0L440.6,21.3L450.7,20.7L461.8,20.5L463.2,20.4L467.9,21.9L471.1,23.1L472.5,22.9L477.9,20.1L486.1,16.6L489.8,15.1L492.0,14.5L495.1,14.5L497.7,15.5L500.3,16.8L501.9,17.9L503.9,17.2L507.7,16.5L510.8,17.0L517.8,19.5L518.8,20.6L520.4,26.5L521.6,27.0L525.6,25.6L528.9,26.3L532.5,28.2L534.9,30.0L536.4,32.0L538.1,35.2L538.7,37.7L539.5,40.7L539.4,49.3L538.1,50.6L537.1,52.5L537.4,54.1L538.5,55.3L540.7,56.1L542.8,56.7L544.0,58.0L545.5,62.9L546.6,63.6L549.1,63.6L553.8,62.5L557.8,60.9L559.6,60.5L559.9,65.1L562.3,66.8L565.5,68.8L566.9,69.5Z";
const MAP_K = 40, MAP_C = Math.cos(Math.PI / 6), MAP_W = 589, MAP_H = 560;
const proj = (lat, lng) => [(lng - 60.4) * MAP_C * MAP_K, (37.4 - lat) * MAP_K];
const unproj = (x, y) => ({ lat: 37.4 - y / MAP_K, lng: 60.4 + x / (MAP_C * MAP_K) });
const inPakistanBox = (lat, lng) => lat > 23.4 && lat < 37.3 && lng > 60.5 && lng < 77.9;

function haversineKm(a, b) {
  const R = 6371, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ROAD_FACTOR = 1.25; // straight-line km x 1.25 as a rough road-distance estimate
const roadKm = (a, b) => Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
const nearestDistrict = (lat, lng) => PK_DISTRICTS.reduce((best, d) => { const km = haversineKm({ lat, lng }, d); return !best || km < best.km ? { ...d, km } : best; }, null);
const provName = (lang, code) => (PROVINCE_NAMES[lang] || PROVINCE_NAMES.en)[code] || PROVINCE_NAMES.en[code] || code || "";
const locLabel = (loc) => (loc ? [loc.village, loc.district].filter(Boolean).join(", ") : "");
const regionsFor = (cc) => (cc === "PK" || !COUNTRIES[cc] ? PK_DISTRICTS : COUNTRIES[cc].regions);
const provincesFor = (cc) => (cc === "PK" ? PROVINCES : [...new Set(regionsFor(cc).map((r) => r.province))]);
const nearestIn = (cc, lat, lng) => regionsFor(cc).reduce((best, d) => { const km = haversineKm({ lat, lng }, d); return !best || km < best.km ? { ...d, km } : best; }, null);
const provLabel = (lang, cc, code) => ((cc || "PK") === "PK" ? provName(lang, code) : code || "");
// Country of a saved location (older saves have no country field)
const locCountry = (loc) => (!loc ? null : loc.country || (loc.lat == null || inPakistanBox(loc.lat, loc.lng) ? "PK" : (COUNTRY_IDS.filter((c) => c !== "PK").map((c) => [c, nearestIn(c, loc.lat, loc.lng).km]).sort((a, b) => a[1] - b[1])[0] || ["PK"])[0]));
const fmtLL = (lat, lng) => `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lng).toFixed(3)}° ${lng >= 0 ? "E" : "W"}`;
const defaultLocFor = (cc) => {
  if (cc === "PK" || !COUNTRIES[cc]) return DEFAULT_LOC_PK;
  const r = COUNTRIES[cc].regions[0];
  return { country: cc, province: r.province, district: r.name, village: "", lat: r.lat, lng: r.lng, source: "district" };
};
const DEFAULT_LOC_PK = { country: "PK", province: "PB", district: "Lahore", village: "Raiwind", lat: 31.25, lng: 74.22, source: "district" };
const DEFAULT_LOC = DEFAULT_LOC_PK;

function PakistanMap({ t, lang, province, pin, selectedDistrict, onPick, onPickDistrict }) {
  const svgRef = useRef(null);
  const viewBox = useMemo(() => {
    if (!province) return [0, 0, MAP_W, MAP_H];
    const pts = PK_DISTRICTS.filter((d) => d.province === province).map((d) => proj(d.lat, d.lng));
    if (pin) pts.push(proj(pin.lat, pin.lng));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
    const w = Math.max(x1 - x0, 120), h = Math.max(y1 - y0, 114);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ratio = MAP_W / MAP_H;
    const W = Math.max(w, h * ratio), H = W / ratio;
    return [cx - W / 2, cy - H / 2, W, H];
  }, [province]); // eslint-disable-line react-hooks/exhaustive-deps
  const scale = viewBox[2] / MAP_W; // marker sizes stay constant on screen
  const click = (e) => {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const ll = unproj(p.x, p.y);
    onPick({ lat: Math.round(ll.lat * 10000) / 10000, lng: Math.round(ll.lng * 10000) / 10000 });
  };
  const shown = PK_DISTRICTS.filter((d) => !province || d.province === province);
  return (
    <svg ref={svgRef} viewBox={viewBox.join(" ")} onClick={click} className="h-full w-full cursor-crosshair touch-manipulation rounded-xl bg-[#dfeaf0]" role="img" aria-label={t("loc_map_hint")} dir="ltr">
      <path d={PK_MAP_PATH} fill="#eef3df" stroke="#145A32" strokeWidth={1.4 * scale} strokeLinejoin="round" />
      {(province ? shown : PK_DISTRICTS).map((d) => {
        const [x, y] = proj(d.lat, d.lng); const sel = selectedDistrict === d.name;
        return (
          <g key={d.name} onClick={(e) => { e.stopPropagation(); onPickDistrict(d); }} className="cursor-pointer">
            <circle cx={x} cy={y} r={(sel ? 5.5 : province ? 4 : 2.6) * scale} fill={PROVINCE_COLORS[d.province]} stroke="#fff" strokeWidth={1 * scale} opacity={sel ? 1 : 0.85} />
            {province && <text x={x + 6 * scale} y={y + 3.5 * scale} fontSize={10 * scale} fill="#2b1c10" fontWeight={sel ? 800 : 600} style={{ paintOrder: "stroke", stroke: "#eef3df", strokeWidth: 3 * scale }}>{d.name}</text>}
            <title>{`${d.name}, ${provName("en", d.province)}`}</title>
          </g>
        );
      })}
      {!province && PROVINCES.map((code) => {
        const ds = PK_DISTRICTS.filter((d) => d.province === code);
        const lat = ds.reduce((s, d) => s + d.lat, 0) / ds.length, lng = ds.reduce((s, d) => s + d.lng, 0) / ds.length;
        const [x, y] = proj(lat, lng);
        return <text key={code} x={x} y={y - 8} textAnchor="middle" fontSize="13" fontWeight="800" fill={PROVINCE_COLORS[code]} style={{ paintOrder: "stroke", stroke: "#eef3df", strokeWidth: 4 }}>{provName("en", code)}</text>;
      })}
      {pin && (() => { const [x, y] = proj(pin.lat, pin.lng); const s = scale; return (
        <g transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none">
          <circle r="14" fill="#E6B325" opacity="0.25" className="radar-ping" style={{ transformOrigin: "0 0" }} />
          <path d="M0 0 C -9 -12 -11 -18 -11 -23 A 11 11 0 1 1 11 -23 C 11 -18 9 -12 0 0 Z" fill="#C0392B" stroke="#fff" strokeWidth="2" />
          <circle cy="-23" r="4.5" fill="#fff" />
        </g>
      ); })()}
    </svg>
  );
}

function LocationPicker({ t, lang, value: rawValue, onSave, onClose }) {
  const cc = CUR.id;
  const REG = regionsFor(cc);
  const value = rawValue && locCountry(rawValue) === cc ? rawValue : null;
  const [province, setProvince] = useState(value ? value.province : "");
  const [district, setDistrict] = useState(value ? value.district : "");
  const [query, setQuery] = useState(value ? value.district : "");
  const [village, setVillage] = useState(value ? value.village || "" : "");
  const [pin, setPin] = useState(value && value.lat ? { lat: value.lat, lng: value.lng } : null);
  const [source, setSource] = useState(value ? value.source || "district" : "district");
  const [gps, setGps] = useState("");
  const [err, setErr] = useState("");
  const [sugOpen, setSugOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  // typing searches every province (selected province first); an empty box lists the selected province
  const suggestions = (q
    ? REG.filter((d) => d.name.toLowerCase().includes(q)).sort((a, b) => (a.province === province ? 0 : 1) - (b.province === province ? 0 : 1) || (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1))
    : REG.filter((d) => !province || d.province === province)).slice(0, 8);
  const chooseDistrict = (d, movePin = true) => {
    setDistrict(d.name); setQuery(d.name); setProvince(d.province); setSugOpen(false); setErr("");
    if (movePin) { setPin({ lat: d.lat, lng: d.lng }); setSource("district"); }
  };
  const dropPin = (ll, src = "pin") => {
    setPin(ll); setSource(src); setErr("");
    const near = nearestIn(cc, ll.lat, ll.lng);
    if (near) { setDistrict(near.name); setQuery(near.name); if (!province || src === "gps") setProvince(near.province); }
  };
  const useGps = () => {
    setErr("");
    if (!("geolocation" in navigator)) { setGps(t("loc_gps_unsupported")); return; }
    setGps(t("loc_gps_wait"));
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const ll = { lat: Math.round(pos.coords.latitude * 10000) / 10000, lng: Math.round(pos.coords.longitude * 10000) / 10000 };
          const inside = cc === "PK" ? inPakistanBox(ll.lat, ll.lng) : (nearestIn(cc, ll.lat, ll.lng) || { km: 1e9 }).km < 900;
          if (!inside) { setGps(t("loc_gps_outside")); return; }
          setGps(""); setVillage(""); dropPin(ll, "gps");
        },
        () => setGps(t("loc_gps_denied")),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    } catch (e) { setGps(t("loc_gps_denied")); }
  };
  const save = () => {
    let d = REG.find((x) => x.name === district);
    if (!d && pin) d = nearestIn(cc, pin.lat, pin.lng);
    if (!d) { setErr(t("loc_err")); return; }
    const p = pin || { lat: d.lat, lng: d.lng };
    onSave({ country: cc, province: d.province, district: d.name, village: village.trim(), lat: p.lat, lng: p.lng, source: pin ? source : "district" });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-soil/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="loc-h" className="flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-ivory shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-3 border-b border-soil/10 bg-forest px-5 py-4 text-ivory">
          <MapPin className="h-6 w-6 text-gold" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="loc-h" className="font-display text-lg font-extrabold">{t("loc_title")}</h2>
            <p className="text-xs text-ivory/75">{t("country_" + cc)} · {cc === "PK" ? t("loc_sub") : t("loc_sub_intl")}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-ivory/10" aria-label={t("close")}><X className="h-5 w-5" /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <Field label={t("loc_province")} htmlFor="loc-prov">
              <select id="loc-prov" value={province} onChange={(e) => { setProvince(e.target.value); if (district && REG.find((d) => d.name === district)?.province !== e.target.value) { setDistrict(""); setQuery(""); } }} className={inputCls}>
                <option value="">{t("all_provinces")}</option>
                {provincesFor(cc).map((c) => <option key={c} value={c}>{provLabel(lang, cc, c)}</option>)}
              </select>
            </Field>
            <div className="relative">
              <Field label={t("loc_district")} htmlFor="loc-dist">
                <div className="relative">
                  <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soil/80" aria-hidden="true" />
                  <input id="loc-dist" dir="ltr" role="combobox" aria-expanded={sugOpen} aria-autocomplete="list" autoComplete="off" value={query}
                    onChange={(e) => { setQuery(e.target.value); setDistrict(""); setSugOpen(true); }} onFocus={() => setSugOpen(true)}
                    onKeyDown={(e) => { if (e.key === "Enter" && suggestions[0]) { e.preventDefault(); chooseDistrict(suggestions[0]); } }}
                    placeholder={t("loc_district_ph")} className={inputCls + " ps-9"} />
                </div>
              </Field>
              {sugOpen && suggestions.length > 0 && (
                <ul role="listbox" className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-soil/15 bg-white py-1 shadow-lg">
                  {suggestions.map((d) => (
                    <li key={d.name} role="option" aria-selected={district === d.name}>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseDistrict(d)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-ivory">
                        <span className="font-semibold text-soil" dir="ltr">{d.name}</span>
                        <span className="text-xs text-soil/80">{provLabel(lang, cc, d.province)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label={t("loc_village")} htmlFor="loc-vil">
              <input id="loc-vil" value={village} onChange={(e) => setVillage(e.target.value)} placeholder={t("loc_village_ph")} className={inputCls} maxLength={80} />
            </Field>
            <button type="button" onClick={useGps} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-forest bg-white px-3 py-2.5 text-sm font-bold text-forest hover:bg-forest/5">
              <LocateFixed className="h-4 w-4" aria-hidden="true" />{t("loc_gps")}
            </button>
            {gps && <p className="rounded-lg bg-gold/15 p-2 text-xs font-semibold text-soil" role="status">{gps}</p>}
            <div className="rounded-xl bg-white p-3 text-sm ring-1 ring-soil/10">
              <p className="flex items-center gap-1.5 font-bold text-forest"><MapPin className="h-4 w-4 text-red-700" aria-hidden="true" />{pin ? t("loc_pin") : t("loc_none")}</p>
              {pin && <p className="mt-0.5 font-mono text-xs text-soil/80" dir="ltr">{fmtLL(pin.lat, pin.lng)} · {source.toUpperCase()}</p>}
              {district && <p className="mt-1 text-xs text-soil/80">{t("loc_nearest")}: <b dir="ltr">{district}</b>{province ? ` · ${provLabel(lang, cc, province)}` : ""}</p>}
            </div>
            {err && <p className="text-sm font-semibold text-red-700" role="alert">{err}</p>}
          </div>
          {cc === "PK" ? (
          <div className="flex min-h-[320px] flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => setProvince("")} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${!province ? "bg-forest text-ivory ring-forest" : "bg-white text-forest ring-soil/20"}`}>{t("loc_fit")}</button>
              {provincesFor(cc).map((c) => (
                <button type="button" key={c} onClick={() => setProvince(c)} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${province === c ? "text-ivory ring-transparent" : "bg-white text-soil ring-soil/20"}`} style={province === c ? { background: PROVINCE_COLORS[c] } : undefined}>{provLabel(lang, cc, c)}</button>
              ))}
            </div>
            <div className="relative flex-1 overflow-hidden rounded-xl ring-1 ring-soil/15" style={{ minHeight: 300 }}>
              <PakistanMap t={t} lang={lang} province={province} pin={pin} selectedDistrict={district} onPick={(ll) => dropPin(ll)} onPickDistrict={(d) => chooseDistrict(d)} />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-soil/80"><Crosshair className="h-3.5 w-3.5" aria-hidden="true" />{t("loc_map_hint")}</p>
          </div>
          ) : (
            <div className="flex min-h-[320px] flex-col">
              <p className="mb-2 text-sm font-bold text-forest">{t("loc_regions")}</p>
              <div className="grid flex-1 content-start gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {REG.map((r) => (
                  <button type="button" key={r.name + r.province} onClick={() => chooseDistrict(r)} aria-pressed={district === r.name && province === r.province}
                    className={`rounded-xl px-3 py-2.5 text-start ring-1 transition ${district === r.name && province === r.province ? "bg-forest text-ivory ring-forest" : "bg-white text-soil ring-soil/15 hover:ring-leaf"}`}>
                    <span className="block text-sm font-bold" dir="ltr">{r.name}</span>
                    <span className={`block text-[11px] ${district === r.name && province === r.province ? "text-ivory/80" : "text-soil/80"}`}>{r.province}</span>
                  </button>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-gold/15 p-2.5 text-xs text-soil"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t("loc_map_pk_only")}</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-soil/10 bg-white px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-soil/20 px-4 py-2.5 text-sm font-bold text-soil">{t("cancel")}</button>
          <button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-forest px-5 py-2.5 text-sm font-bold text-ivory"><Check className="h-4 w-4" aria-hidden="true" />{t("loc_save")}</button>
        </div>
      </div>
    </div>
  );
}

function LocationField({ t, lang, value, onChange, label, error, allowClear, id }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {label && <p className="mb-1 text-sm font-semibold text-soil" id={id ? id + "-l" : undefined}>{label}</p>}
      <div className={`flex items-center gap-2 rounded-xl border bg-white px-3 py-2 ${error ? "border-red-400" : "border-soil/20"}`}>
        <MapPin className={`h-5 w-5 shrink-0 ${value ? "text-red-700" : "text-soil/80"}`} aria-hidden="true" />
        <button type="button" id={id} onClick={() => setOpen(true)} className="min-w-0 flex-1 text-start" aria-describedby={id ? id + "-l" : undefined}>
          {value ? (
            <>
              <span className="block truncate text-sm font-bold text-soil">{locLabel(value)}</span>
              <span className="block truncate text-[11px] text-soil/80">{provLabel(lang, value.country, value.province)} · <span dir="ltr">{fmtLL(value.lat, value.lng)}</span></span>
            </>
          ) : <span className="text-sm text-soil/80">{t("loc_none")}</span>}
        </button>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-lg bg-forest/5 px-2.5 py-1.5 text-xs font-bold text-forest hover:bg-forest/10">{value ? t("loc_change") : t("loc_set")}</button>
        {allowClear && value && <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-lg p-1.5 text-soil/80 hover:text-soil" aria-label={t("loc_clear")}><X className="h-4 w-4" /></button>}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
      {open && createPortal(<LocationPicker t={t} lang={lang} value={value} onClose={() => setOpen(false)} onSave={(loc) => { onChange(loc); setOpen(false); }} />, document.body)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Brand logo (custom SVG)                                             */
/* ------------------------------------------------------------------ */
function Logo({ className = "h-11 w-11", title = "Agri-Share logo" }) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={title}>
      <defs>
        <linearGradient id="as-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#67A834" />
          <stop offset="1" stopColor="#2E7D32" />
        </linearGradient>
        <linearGradient id="as-leafL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8BC34A" />
          <stop offset="1" stopColor="#4C9A2A" />
        </linearGradient>
        <linearGradient id="as-leafR" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#67A834" />
          <stop offset="1" stopColor="#2F7D32" />
        </linearGradient>
        <clipPath id="as-bowl">
          <path d="M18 126 Q100 108 182 126 Q176 178 100 192 Q24 178 18 126Z" />
        </clipPath>
      </defs>
      {/* open ring */}
      <circle cx="100" cy="104" r="82" fill="none" stroke="url(#as-ring)" strokeWidth="9" strokeLinecap="round" strokeDasharray="400 115.2" transform="rotate(-50.5 100 104)" />
      {/* sprouting leaves */}
      <path d="M100 58 C 90 52 72 42 66 16 C 88 16 101 32 100 58 Z" fill="url(#as-leafL)" />
      <path d="M100 58 C 110 52 128 42 134 16 C 112 16 99 32 100 58 Z" fill="url(#as-leafR)" />
      <path d="M99 55 C 92 44 82 32 72 22" stroke="#FAF8EE" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      <path d="M101 55 C 108 44 118 32 128 22" stroke="#FAF8EE" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.8" />
      {/* farmer (left), mirrored for right */}
      <g id="as-farmer">
        <path d="M40 136 C 40 114 50 102 68 100 C 78 99 85 103 89 109 L 101 116 C 104 118 103 123 99 123 L 88 121 C 87 127 87 132 87 136 Z" fill="#4C9A2A" />
        <circle cx="68" cy="85" r="11.5" fill="#4C9A2A" />
        <ellipse cx="68" cy="75" rx="19" ry="4.2" fill="#2F7D32" />
        <path d="M58 75 C 58 64 62 61 68 61 C 74 61 78 64 78 75 Z" fill="#3E8E2E" />
        <rect x="58" y="70" width="20" height="3" fill="#2A6B26" />
      </g>
      <use href="#as-farmer" transform="translate(200 0) scale(-1 1)" />
      {/* clasped hands */}
      <path d="M92 114 C 96 110 104 110 108 114 C 110 117 108 121 104 121 L 96 121 C 92 121 90 117 92 114 Z" fill="#67A834" stroke="#2F7D32" strokeWidth="1.4" />
      <path d="M95 116 L 105 116 M 96 118.5 L 104 118.5" stroke="#2F7D32" strokeWidth="1" />
      {/* rising harvest sun */}
      <circle cx="100" cy="136" r="16" fill="#E6B325" />
      {/* ploughed soil bowl with furrows and seeds */}
      <g clipPath="url(#as-bowl)">
        <rect x="0" y="100" width="200" height="100" fill="#5C3A21" />
        <path d="M10 150 Q60 128 100 142 Q140 128 190 150 L190 200 L10 200 Z" fill="#7A4E2D" />
        <path d="M18 128 Q70 120 98 146" stroke="#FAF8EE" strokeWidth="4" fill="none" />
        <path d="M182 128 Q130 120 102 146" stroke="#FAF8EE" strokeWidth="4" fill="none" />
        <path d="M30 168 Q70 150 100 160 Q130 150 170 168" stroke="#FAF8EE" strokeWidth="4" fill="none" />
        {[[40, 140], [58, 136], [75, 141], [125, 141], [142, 136], [160, 140], [52, 180], [80, 172], [120, 172], [148, 180], [100, 182], [66, 156], [134, 156]].map(([x, y], i) => (
          <ellipse key={i} cx={x} cy={y} rx="3" ry="1.8" fill="#D9A441" opacity="0.9" transform={`rotate(-20 ${x} ${y})`} />
        ))}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Small UI primitives                                                 */
/* ------------------------------------------------------------------ */
function Toggle({ checked, onChange, disabled, label, sub, id }) {
  return (
    <label htmlFor={id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 ${disabled ? "border-soil/10 bg-ivory/60 opacity-70" : "cursor-pointer border-soil/15 bg-white hover:border-leaf/60"}`}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-soil">{label}</span>
        {sub && <span className="block text-xs text-soil/80">{sub}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-soil/20 transition peer-checked:bg-leaf peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-focus-visible:ring-offset-2" />
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all start-0.5 peer-checked:start-[1.375rem]" />
      </span>
    </label>
  );
}

function Field({ label, children, error, htmlFor, hint }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-soil">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-soil/80">{hint}</p>}
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-soil/20 bg-white px-3 py-2.5 text-sm text-soil placeholder:text-soil/80 focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30";

function StatusPill({ status, t }) {
  const map = {
    sent: "bg-gold/20 text-soil", confirmed: "bg-leaf/15 text-forest", completed: "bg-forest/10 text-forest",
    feedback: "bg-forest text-ivory", declined: "bg-red-100 text-red-800", cancelled: "bg-soil/10 text-soil/80", countered: "bg-gold text-soil",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${map[status]}`}>{t("st_" + status)}</span>;
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Toasts: typed, glass cards with an auto-dismiss progress bar        */
/* ------------------------------------------------------------------ */
function Toasts({ toasts, dismiss }) {
  const tone = {
    success: { Icon: CircleCheck, ring: "ring-leaf/30", icon: "text-leafink bg-leaf/10", bar: "bg-leaf" },
    info: { Icon: Info, ring: "ring-forest/20", icon: "text-forest bg-forest/10", bar: "bg-forest" },
    warn: { Icon: TriangleAlert, ring: "ring-gold/50", icon: "text-soil bg-gold/25", bar: "bg-gold" },
    error: { Icon: TriangleAlert, ring: "ring-red-300", icon: "text-red-700 bg-red-50", bar: "bg-red-500" },
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-3 lg:bottom-6 lg:end-auto lg:start-4 lg:w-[400px] lg:items-stretch lg:px-0" aria-live="polite" role="status">
      {toasts.map((x) => {
        const s = tone[x.type] || tone.success;
        return (
          <div key={x.id} className={`toast-in pointer-events-auto relative flex w-full max-w-md items-start gap-3 overflow-hidden rounded-2xl bg-white/90 px-4 py-3 text-sm text-soil shadow-2xl shadow-forest/15 ring-1 backdrop-blur-xl ${s.ring}`}>
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${s.icon}`}><s.Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" aria-hidden="true" /></span>
            <div className="min-w-0 flex-1">
              {x.title && <p className="font-bold text-forest">{x.title}</p>}
              <p className="leading-snug">{x.text}</p>
              {x.action && <button onClick={() => { x.action.run(); dismiss(x.id); }} className="mt-1.5 text-xs font-bold text-forest underline-offset-2 hover:underline">{x.action.label}</button>}
            </div>
            <button onClick={() => dismiss(x.id)} className="rounded-lg p-1 text-soil/80 transition hover:bg-soil/5 hover:text-soil" aria-label="Dismiss"><X className="h-4 w-4" /></button>
            <span className={`toast-bar absolute bottom-0 start-0 h-0.5 ${s.bar}`} style={{ animationDuration: `${x.ms}ms` }} aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header: clean top bar, country & language pill, desktop tab bar,    */
/* and an app-style bottom bar on phones                               */
/* ------------------------------------------------------------------ */
const TABS = [
  { key: "marketplace", label: "nav_market", short: "nav_s_market", icon: Store },
  { key: "live-request", label: "nav_live", short: "nav_s_live", icon: Radar },
  { key: "agri-mandi", label: "nav_mandi", short: "nav_s_mandi", icon: Wheat },
  { key: "bookings", label: "nav_bookings", short: "nav_s_bookings", icon: ClipboardList },
  { key: "owner-portal", label: "nav_owner", short: "nav_s_owner", icon: HandCoins },
  { key: "agri-agent", label: "nav_agent", short: "nav_s_agent", icon: Smartphone },
];

function PrefsPill({ t, lang, setLang, country, setCountry, full }) {
  return (
    <div className={`flex items-center rounded-full border border-forest/15 bg-white/80 p-0.5 shadow-sm backdrop-blur ${full ? "w-full" : ""}`} title={t("fx_note")}>
      {setCountry && (
        <label className={`flex min-w-0 items-center gap-1 rounded-full py-1 pe-1 ps-2.5 transition hover:bg-forest/5 ${full ? "flex-1" : ""}`}>
          <Globe className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
          <span className="sr-only">{t("country")}</span>
          <select id={full ? "country-m" : "country"} value={country} onChange={(e) => setCountry(e.target.value)} className={`cursor-pointer bg-transparent text-sm font-semibold text-forest focus:outline-none ${full ? "w-full min-w-0" : "max-w-[7.5rem] sm:max-w-[10rem]"}`}>
            {COUNTRY_IDS.map((cc) => <option key={cc} value={cc}>{t("country_" + cc)}</option>)}
          </select>
        </label>
      )}
      {setCountry && <span className="h-5 w-px bg-forest/15" aria-hidden="true" />}
      <label className={`flex min-w-0 items-center gap-1 rounded-full py-1 pe-1 ps-2 transition hover:bg-forest/5 ${full ? "flex-1" : ""}`}>
        <Languages className="h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
        <span className="sr-only">Language</span>
        <select id={full ? "lang-m" : "lang"} value={lang} onChange={(e) => setLang(e.target.value)} className={`cursor-pointer bg-transparent text-sm font-semibold text-forest focus:outline-none ${full ? "w-full min-w-0" : "max-w-[6.5rem] sm:max-w-none"}`}>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>
    </div>
  );
}

function NavBadge({ n, alert }) {
  return n > 0 ? <span className={`min-w-[18px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px] ${alert ? "bg-red-600 text-white" : "bg-gold text-soil"}`} aria-label={alert ? `${n} new` : undefined}>{n}</span> : null;
}

function Header({ t, lang, setLang, tab, setTab, pendingCount, activeCount, tabs, account, country, setCountry, activityCount, onActivity, adminCount = 0 }) {
  return (
    <>
    <header className="sticky top-0 z-40 w-full max-w-full border-b border-forest/10 bg-white/95 shadow-[0_1px_0_rgba(20,90,50,0.04)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-6">
        <button onClick={() => setTab("marketplace")} className="flex min-w-0 items-center gap-2.5 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold" aria-label="Agri-Share home">
          <Logo className="h-9 w-9 shrink-0 sm:h-11 sm:w-11" />
          <span className="min-w-0 text-start">
            <span className="block whitespace-nowrap font-display text-base font-extrabold leading-none tracking-tight text-forest min-[400px]:text-lg sm:text-xl">Agri<span className="text-gold">-</span>Share</span>
            <span className="hidden truncate text-xs font-medium text-soil/80 md:block">{t("tagline")}</span>
          </span>
        </button>
        <div className="ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="hidden md:block"><PrefsPill t={t} lang={lang} setLang={setLang} country={country} setCountry={setCountry} /></div>
          <button onClick={onActivity} className="relative inline-flex items-center gap-1.5 rounded-full border border-forest/15 bg-white/80 px-2.5 py-2 text-sm font-bold text-forest sm:px-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" aria-label={t("act_title")}>
            <Activity className="h-4 w-4" aria-hidden="true" /><span className="text-xs sm:text-sm">{t("nav_activity")}</span>
            {activityCount > 0 && <span className="absolute -end-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-soil ring-2 ring-ivory">{activityCount}</span>}
          </button>
          {account}
        </div>
      </div>
      {/* desktop tab bar */}
      <nav data-nav className="mx-auto hidden max-w-7xl items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:flex" aria-label="Main">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-1.5 text-sm font-semibold transition ${tab === key ? "text-forest" : "text-soil/80 hover:text-forest"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{t(label)}
            {key === "bookings" && <NavBadge n={activeCount} />}
            {key === "owner-portal" && <NavBadge n={pendingCount} />}
            {key === "admin" && <NavBadge n={adminCount} alert />}
            <span className={`absolute inset-x-2 bottom-0 h-[3px] rounded-t-full transition-all ${tab === key ? "bg-forest" : "bg-transparent"}`} aria-hidden="true" />
          </button>
        ))}
      </nav>
    </header>
    {/* phones: country & language scroll away with the page so the sticky bar stays one compact row */}
    <div className="w-full border-b border-forest/5 bg-white/80 px-4 py-2 md:hidden"><PrefsPill full t={t} lang={lang} setLang={setLang} country={country} setCountry={setCountry} /></div>
    </>
  );
}

function BottomNav({ t, tab, setTab, tabs, activeCount, pendingCount, onActivity, activityCount, adminCount = 0 }) {
  const [more, setMore] = useState(false);
  const main = ["marketplace", "live-request", "agri-mandi", "bookings"];
  const rest = tabs.filter((x) => !main.includes(x.key));
  const item = (key, Icon, label, badge, onClick) => (
    <button key={key} onClick={onClick} aria-current={tab === key ? "page" : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-semibold transition ${tab === key ? "text-forest" : "text-soil/80"}`}>
      <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${tab === key ? "bg-forest/10" : ""}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <span className="max-w-full truncate px-1">{label}</span>
      {badge > 0 && <span className="absolute end-[18%] top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-soil">{badge}</span>}
    </button>
  );
  return (
    <>
      <nav data-nav aria-label="Main mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-forest/10 bg-white/85 px-2 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 shadow-[0_-8px_30px_rgba(20,90,50,0.10)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          {main.map((k) => { const x = TABS.find((y) => y.key === k); return item(k, x.icon, t(x.short), k === "bookings" ? activeCount : 0, () => setTab(k)); })}
          {item("__more", Menu, t("nav_s_more"), (rest.some((x) => x.key === "owner-portal") ? pendingCount : 0) + (rest.some((x) => x.key === "admin") ? adminCount : 0), () => setMore(true))}
        </div>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[60] flex items-end bg-soil/40 backdrop-blur-sm lg:hidden" onClick={() => setMore(false)}>
          <div className="sheet-in w-full rounded-t-3xl bg-ivory p-4 pb-8 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("nav_s_more")}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-soil/20" aria-hidden="true" />
            <div className="grid grid-cols-3 gap-2">
              {[...rest.map((x) => [x.key, x.icon, t(x.label), () => setTab(x.key)]), ["__act", Activity, t("nav_activity"), onActivity]].map(([k, Icon, label, run]) => (
                <button key={k} onClick={() => { setMore(false); run(); }} className="relative flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center text-xs font-bold text-forest shadow-sm ring-1 ring-soil/10 transition active:scale-95">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest/10"><Icon className="h-5 w-5" aria-hidden="true" /></span>{label}
                  {k === "owner-portal" && pendingCount > 0 && <span className="absolute end-2 top-2 rounded-full bg-gold px-1.5 text-[10px] text-soil">{pendingCount}</span>}
                  {k === "admin" && adminCount > 0 && <span className="absolute end-2 top-2 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{adminCount}</span>}
                  {k === "__act" && activityCount > 0 && <span className="absolute end-2 top-2 rounded-full bg-gold px-1.5 text-[10px] text-soil">{activityCount}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hero: split layout, two role CTAs, live counts; trust strip below   */
/* ------------------------------------------------------------------ */
function Hero({ t, onFind, onList, onLive, isEnglish, stats }) {
  return (
    <section className="relative overflow-hidden bg-forest text-ivory">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden="true" style={{ backgroundImage: "repeating-linear-gradient(-8deg, #FAF8EE 0 2px, transparent 2px 26px)" }} />
      <div className="pointer-events-none absolute -top-32 start-1/3 h-80 w-80 rounded-full bg-leaf/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-24 -end-24 h-80 w-80 rounded-full bg-gold/25 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pb-20 lg:pt-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-ivory/10 px-3 py-1 text-xs font-semibold text-ivory/90 ring-1 ring-ivory/20 backdrop-blur">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-gold" /></span>
            {t("hero_kicker")}
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold leading-[1.18] tracking-tight sm:text-4xl sm:leading-[1.15] lg:text-5xl lg:leading-[1.15]">{t("hero_title")}</h1>
          {isEnglish && <p className="mt-2 text-base font-medium italic text-ivory/80 sm:text-lg" lang="ur-Latn">"{t("hero_local")}"</p>}
          <p className="mt-4 max-w-xl text-base text-ivory/80 sm:text-lg">{t("hero_desc")}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button onClick={onLive} className="group flex items-center gap-3 rounded-2xl bg-gold p-4 text-start text-soil shadow-xl shadow-black/15 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ivory">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-soil/10"><Tractor className="h-6 w-6" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-soil/80">{t("hero_role_farmer")}</span>
                <span className="block font-display text-lg font-extrabold leading-tight">{t("hero_need")}</span>
                <span className="block truncate text-xs font-semibold text-soil/80">{t("cta_live")}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1 rtl:-scale-x-100" aria-hidden="true" />
            </button>
            <button onClick={onList} className="group flex items-center gap-3 rounded-2xl bg-ivory/10 p-4 text-start text-ivory ring-1 ring-ivory/25 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:bg-ivory/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ivory/10"><Coins className="h-6 w-6 text-gold" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-ivory/80">{t("hero_role_owner")}</span>
                <span className="block font-display text-lg font-extrabold leading-tight">{t("hero_earn")}</span>
                <span className="block truncate text-xs font-semibold text-ivory/80">{t("cta_list")}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
          <button onClick={onFind} className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ivory/80 underline-offset-4 hover:text-ivory hover:underline"><Search className="h-4 w-4" aria-hidden="true" />{t("cta_find")}</button>
        </div>
        {/* photo collage with live counts */}
        <div className="relative hidden h-[420px] lg:block" aria-hidden="true">
          <div className="absolute end-0 top-0 h-[300px] w-[78%] overflow-hidden rounded-3xl shadow-2xl ring-1 ring-ivory/20"><MachinePhoto category="tractor" className="h-full w-full" alt="" priority="high" width={960} height={540} /></div>
          <div className="absolute bottom-0 start-0 h-[190px] w-[48%] overflow-hidden rounded-3xl shadow-2xl ring-4 ring-forest"><MachinePhoto category="harvester" className="h-full w-full" alt="" /></div>
          <div className="absolute bottom-6 end-6 h-[150px] w-[36%] overflow-hidden rounded-3xl shadow-2xl ring-4 ring-forest"><MachinePhoto category="drone" className="h-full w-full" alt="" /></div>
          <div className="float-y absolute start-4 top-10 rounded-2xl bg-white/90 p-3 text-soil shadow-xl ring-1 ring-white/60 backdrop-blur-xl">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-leafink"><span className="h-2 w-2 animate-pulse rounded-full bg-leaf" />{t("hero_live")}</p>
            <p className="mt-1 font-display text-2xl font-extrabold text-forest">{stats.machines}</p>
            <p className="text-xs text-soil/80">{t("hero_machines")}</p>
          </div>
          <div className="float-y-slow absolute bottom-[200px] end-[40%] rounded-2xl bg-white/90 px-3 py-2.5 text-soil shadow-xl ring-1 ring-white/60 backdrop-blur-xl">
            <p className="flex items-center gap-2 text-sm font-bold text-forest"><BadgeCheck className="h-5 w-5 text-leafink" />{stats.owners} {t("hero_owners")}</p>
            {stats.bookings > 0 && <p className="text-xs text-soil/80">{stats.bookings} {t("hero_bookings")}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustStrip({ t }) {
  const items = [
    [ShieldCheck, t("tr1_t"), t("tr1_s")],
    [Percent, t("tr2_t"), t("tr2_s")],
    [Sprout, t("tr3_t"), t("tr3_s")],
    [Headphones, t("tr4_t"), t("tr4_s")],
  ];
  return (
    <div className="relative z-10 mx-auto -mt-8 max-w-7xl px-4 sm:px-6">
      <ul className="grid gap-px overflow-hidden rounded-3xl bg-forest/10 shadow-xl shadow-forest/10 ring-1 ring-forest/10 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([Icon, title, sub]) => (
          <li key={title} className="flex items-start gap-3 bg-white/95 p-4 backdrop-blur transition hover:bg-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-forest">{title}</span>
              <span className="block text-xs leading-snug text-soil/80">{sub}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-soil/10 bg-white shadow-sm" aria-hidden="true">
      <div className="skeleton aspect-video w-full" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-3 w-24 rounded" /><div className="skeleton h-7 w-36 rounded" />
        <div className="skeleton h-6 w-44 rounded-full" /><div className="skeleton h-3 w-full rounded" /><div className="skeleton h-3 w-4/5 rounded" />
        <div className="skeleton h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Digital booking voucher (printable, downloadable)                   */
/* ------------------------------------------------------------------ */
const voucherCode = (b) => {
  const digits = String(b.id || "").replace(/\D/g, "").slice(-3).padStart(3, "0");
  const yr = new Date(b.createdAt || Date.now()).getFullYear();
  return `#AS-${yr}-${digits}`;
};
// Deterministic QR-style pattern (decorative verification badge, not a scannable QR code)
function VerifyPattern({ seed, size = 116 }) {
  const n = 21;
  const rnd = seededRandom(String(seed));
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const cells = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!finder(r, c) && rnd() > 0.52) cells.push([r, c]);
  const Finder = ({ x, y }) => (<g><rect x={x} y={y} width="7" height="7" fill="#145A32" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#145A32" /></g>);
  return (
    <svg viewBox={`-1 -1 ${n + 2} ${n + 2}`} width={size} height={size} role="img" aria-label="Verification pattern" shapeRendering="crispEdges">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} fill="#fff" />
      {cells.map(([r, c]) => <rect key={r + "-" + c} x={c} y={r} width="1" height="1" fill="#145A32" />)}
      <Finder x={0} y={0} /><Finder x={n - 7} y={0} /><Finder x={0} y={n - 7} />
    </svg>
  );
}

function voucherSteps(b) {
  const stopped = ["declined", "cancelled"].includes(b.status);
  const confirmed = ["confirmed", "completed", "feedback"].includes(b.status);
  const done = ["completed", "feedback"].includes(b.status);
  const enRoute = done || (confirmed && (b.enRouteAt || (b.date && b.date <= todayISO())));
  return { stopped, steps: [confirmed, !!enRoute, done] };
}

function VoucherModal({ b, t, dn, onClose, updateBooking }) {
  const ref = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!b) return null;
  const q = b.quote || {};
  const code = voucherCode(b);
  const { stopped, steps } = voucherSteps(b);
  const cur = steps.indexOf(false);
  const rows = [
    [t("bk_base") + ` (${q.hours || b.hours} h × ${pkr(q.rate || 0)})`, q.base],
    q.operator ? [t("bk_op"), q.operator] : null,
    q.transport ? [t("bk_tr"), q.transport] : null,
    q.fuel ? [t("vo_fuel"), q.fuel] : null,
    [t("bk_comm").replace("{p}", pctLabel(q.commissionRate || COMMISSION)), q.commission],
  ].filter(Boolean).filter((r) => r[1] != null);
  const print = () => {
    document.body.classList.add("print-voucher");
    const done = () => { document.body.classList.remove("print-voucher"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { try { window.print(); } catch (e) { done(); } }, 50);
  };
  const download = async () => {
    const css = "body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#FAF8EE;color:#5C3A21;margin:0;padding:24px}.v{max-width:640px;margin:auto;background:#fff;border-radius:20px;border:1px solid #e7e2d3;overflow:hidden}.h{background:#145A32;color:#FAF8EE;padding:20px 24px}.h b{color:#E6B325}.p{padding:20px 24px}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 0;border-bottom:1px solid #f0ebdd}td:last-child{text-align:right;font-weight:700}.tot td{font-size:18px;color:#145A32;border:0}.muted{color:#8a7563;font-size:12px}svg{display:block}";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Agri-Share voucher ${code}</title><style>${css}</style></head><body>${ref.current ? ref.current.outerHTML.replace(/class="[^"]*"/g, "") : ""}</body></html>`;
    const filename = `Agri-Share-voucher-${code.replace("#", "")}.html`;
    // inside claude.ai the page must ask the viewer through the downloads capability
    if (typeof window !== "undefined" && window.claude && typeof window.claude.use === "function") {
      try { const dl = await window.claude.use("downloads"); if (dl) { await dl.save({ filename, data: html }); return; } } catch (e) { return; }
    }
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  return createPortal(
    <div id="voucher-root" className="fixed inset-0 z-[85] flex items-end justify-center bg-soil/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div className="sheet-in max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-ivory shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="vo-h">
        <div ref={ref} className="voucher-card overflow-hidden bg-white sm:m-4 sm:rounded-2xl sm:ring-1 sm:ring-soil/10">
          <div className="h relative overflow-hidden bg-forest px-5 py-5 text-ivory">
            <div className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-2xl" aria-hidden="true" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Agri-Share</p>
                <h2 id="vo-h" className="font-display text-xl font-extrabold">{t("vo_title")}</h2>
                <p className="mt-1 font-mono text-lg font-bold tracking-wider text-gold" dir="ltr"><b>{code}</b></p>
                <p className="muted text-xs text-ivory/80" dir="ltr">{t("vo_ref")}: {b.id} · {t("vo_issued")} {fmtDate(new Date(b.createdAt || Date.now()).toISOString().slice(0, 10))}</p>
              </div>
              <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-lg"><VerifyPattern seed={b.id + "|" + b.createdAt} size={92} /></div>
            </div>
          </div>
          <div className="p space-y-4 p-5">
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${stopped ? "bg-red-50 text-red-700" : "bg-leaf/10 text-forest"}`}>
              {stopped ? <X className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {stopped ? t("vo_cancelled") : t("vo_verified")}
            </div>
            {!stopped && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-soil/80">{t("vo_track")}</p>
                <ol className="grid grid-cols-3 gap-1">
                  {[t("vo_s1"), t("vo_s2"), t("vo_s3")].map((label, i) => (
                    <li key={label} className="flex flex-col items-center text-center">
                      <div className="flex w-full items-center">
                        <span className={`h-1 flex-1 rounded ${i === 0 ? "invisible" : steps[i] ? "bg-leaf" : "bg-soil/15"}`} />
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${steps[i] ? "bg-leafink text-white" : i === cur ? "bg-gold text-soil ring-4 ring-gold/25" : "bg-soil/10 text-soil/80"}`}>
                          {steps[i] ? <Check className="h-4 w-4" aria-hidden="true" /> : i === 1 ? <Truck className="h-4 w-4" aria-hidden="true" /> : i + 1}
                        </span>
                        <span className={`h-1 flex-1 rounded ${i === 2 ? "invisible" : steps[i + 1] ? "bg-leaf" : "bg-soil/15"}`} />
                      </div>
                      <span className={`mt-1 text-[11px] font-semibold leading-tight ${steps[i] ? "text-forest" : i === cur ? "text-soil" : "text-soil/80"}`}>{label}</span>
                    </li>
                  ))}
                </ol>
                {cur === 0 && <p className="mt-2 text-center text-xs text-soil/80">{t("vo_waiting")}</p>}
                {cur === 1 && updateBooking && <div className="mt-2 text-center"><button onClick={() => updateBooking(b.id, b.status, { enRouteAt: Date.now() }, true)} className="rounded-lg bg-forest/5 px-3 py-1.5 text-xs font-bold text-forest hover:bg-forest/10">{t("vo_mark_route")}</button></div>}
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {[[t("vo_machine"), b.listingName], [t("vo_date"), fmtDate(b.date) + " · " + (q.hours || b.hours) + " h"], [t("owner"), b.ownerId], [t("vo_location"), dn ? dn(b.district || "") : b.district], [t("vo_renter"), b.renterName || "-"], [t("bk_pay"), t("pay_" + b.payment)]].map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-soil/80">{k}</dt><dd className="truncate font-bold text-soil" dir="auto">{v}</dd></div>
              ))}
            </dl>
            <div className="rounded-xl bg-ivory/70 p-3 ring-1 ring-soil/10">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-soil/80">{t("vo_items")}</p>
              <table className="w-full text-sm"><tbody>
                {rows.map(([k, v]) => <tr key={k} className="border-b border-soil/10"><td className="py-1.5 text-soil/80">{k}</td><td className="py-1.5 text-end font-semibold" dir="ltr">{pkr(v)}</td></tr>)}
                <tr className="tot"><td className="pt-2 font-display text-base font-extrabold text-forest">{t("vo_total")}</td><td className="pt-2 text-end font-display text-xl font-extrabold text-forest" dir="ltr">{pkr(q.total || 0)}</td></tr>
              </tbody></table>
              {b.financing && <p className="mt-2 text-xs text-soil/80" dir="ltr">{t("pay_paylater")}: {t("pl_now")} <b>{pkr(b.financing.advance)}</b> · {t("pl_later")} <b>{pkr(b.financing.balance)}</b> ({b.financing.partner})</p>}
            </div>
            <p className="muted text-[11px] leading-snug text-soil/80">{t("vo_note")} {t("vo_pattern_note")}</p>
          </div>
        </div>
        <div className="no-print sticky bottom-0 flex flex-wrap gap-2 border-t border-soil/10 bg-ivory/95 p-4 backdrop-blur">
          <button onClick={print} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-ivory transition hover:bg-[#0f4a28]"><Printer className="h-4 w-4" aria-hidden="true" />{t("vo_print")}</button>
          <button onClick={download} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-forest ring-1 ring-forest/20 transition hover:bg-forest/5"><Download className="h-4 w-4" aria-hidden="true" />{t("vo_download")}</button>
          <button onClick={onClose} aria-label="Close voucher" className="inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold text-soil ring-1 ring-soil/15 transition hover:bg-white">{t("vo_close")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* My Activity drawer: bookings, live requests and Agri-Market deals   */
/* ------------------------------------------------------------------ */
function ActivityDrawer({ t, dn, open, onClose, bookings, requests, deals, onVoucher, setTab }) {
  const [view, setView] = useState("bookings");
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  const tabs = [["bookings", t("act_bookings"), bookings.length], ["requests", t("act_requests"), requests.length], ["deals", t("act_deals"), deals.length]];
  const go = (k) => { onClose(); setTab(k); };
  const Empty = ({ text, cta, to }) => (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center ring-1 ring-soil/10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-forest/10 text-forest"><Inbox className="h-6 w-6" aria-hidden="true" /></span>
      <p className="text-sm text-soil/80">{text}</p>
      <button onClick={() => go(to)} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">{cta}</button>
    </div>
  );
  return createPortal(
    <div className="fixed inset-0 z-[75] flex justify-end bg-soil/40 backdrop-blur-sm" onClick={onClose}>
      <aside className="drawer-in flex h-full w-full max-w-md flex-col bg-ivory shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="act-h">
        <div className="flex items-center justify-between gap-2 border-b border-soil/10 bg-white/80 px-5 py-4 backdrop-blur">
          <div>
            <h2 id="act-h" className="font-display text-xl font-extrabold text-forest">{t("act_title")}</h2>
            <p className="text-xs text-soil/80">{t("act_sub")}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-soil/80 hover:bg-soil/5" aria-label={t("vo_close")}><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-1 border-b border-soil/10 bg-white/60 px-3 py-2" role="tablist">
          {tabs.map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-bold transition ${view === k ? "bg-forest text-ivory shadow" : "text-soil/80 hover:bg-soil/5"}`}>
              {label}<span className={`rounded-full px-1.5 text-[11px] ${view === k ? "bg-ivory/20" : "bg-soil/10"}`}>{n}</span>
            </button>
          ))}
        </div>
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {view === "bookings" && (bookings.length ? bookings.map((b) => (
            <button key={b.id} onClick={() => onVoucher(b.id)} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-start shadow-sm ring-1 ring-soil/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
              <MachinePhoto category={b.category} name={b.listingName} className="h-14 w-16 shrink-0 rounded-xl" alt="" width={128} height={112} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-forest">{b.listingName}</span>
                <span className="block truncate text-xs text-soil/80" dir="ltr">{voucherCode(b)} · {fmtDate(b.date)} · {pkr((b.quote && b.quote.total) || 0)}</span>
                <span className="mt-1 inline-block"><StatusPill status={b.status} t={t} /></span>
              </span>
              <span className="flex shrink-0 flex-col items-center text-[10px] font-bold text-forest"><Ticket className="h-5 w-5" aria-hidden="true" />{t("act_voucher")}</span>
            </button>
          )) : <Empty text={t("act_empty_b")} cta={t("nav_market")} to="marketplace" />)}
          {view === "requests" && (requests.length ? requests.map((r) => (
            <button key={r.id} onClick={() => go("live-request")} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-start shadow-sm ring-1 ring-soil/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest"><Radar className="h-6 w-6" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-forest">{t("one_" + r.category)} · {r.village}</span>
                <span className="block truncate text-xs text-soil/80" dir="ltr">{r.id} · {fmtDate(r.date)} · {pkr(r.rate)}/hr · T{r.tierReached || 1}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === "booked" ? "bg-leaf/15 text-forest" : r.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("rq_" + r.status)}</span>
            </button>
          )) : <Empty text={t("act_empty_r")} cta={t("nav_live")} to="live-request" />)}
          {view === "deals" && (deals.length ? deals.map((p) => (
            <button key={p.id} onClick={() => go("agri-mandi")} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-start shadow-sm ring-1 ring-soil/10 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-soil"><Wheat className="h-6 w-6" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-forest">{t("crop_" + p.crop) !== "crop_" + p.crop ? t("crop_" + p.crop) : p.crop} · {p.qty} {t("am_mann")}</span>
                <span className="block truncate text-xs text-soil/80" dir="ltr">{p.id} · {pkr(p.rate)} / {t("am_mann")}{p.sale ? ` · ${pkr(p.sale.gross || 0)}` : ""}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${p.status === "sold" ? "bg-leaf/15 text-forest" : "bg-gold/25 text-soil"}`}>{p.status === "sold" ? t("act_sold") : t("act_open")}</span>
            </button>
          )) : <Empty text={t("act_empty_d")} cta={t("nav_mandi")} to="agri-mandi" />)}
        </div>
        <div className="border-t border-soil/10 bg-white/80 p-3 text-center">
          <button onClick={() => go("bookings")} className="text-sm font-bold text-forest underline-offset-2 hover:underline">{t("act_all")}</button>
        </div>
      </aside>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Marketplace                                                         */
/* ------------------------------------------------------------------ */
function ListingCard({ l, t, dn, lang, onBook }) {
  const opText = l.operator === "included" ? t("op_included") : l.operator === "optional" ? t("op_optional") : t("op_none");
  const trText = l.transport === "included" ? t("tr_included") : l.transport === "optional" ? t("tr_fee").replace("{fee}", pkr(transportFee(l.distance))).replace("{km}", l.distance) : t("tr_self");
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-soil/10 bg-white shadow-sm ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/10 hover:ring-forest/10">
      <div className="relative aspect-video overflow-hidden text-ivory">
        <MachinePhoto category={l.category} name={l.name} className="h-full w-full transition-transform duration-500 group-hover:scale-105" alt={l.name} />
        <div className="absolute start-3 end-3 top-3 flex flex-wrap gap-1.5">
          {l.spec && <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/25 backdrop-blur-md" dir="ltr">{String(l.spec).split(/[,·]/)[0].trim().slice(0, 22)}</span>}
          <span className="rounded-full bg-gold/90 px-2 py-0.5 text-[11px] font-bold text-soil backdrop-blur-md">{t("ov_dry")}</span>
          {l.operator === "included" && <span className="rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-bold text-forest backdrop-blur-md">{t("ov_op")}</span>}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-3 pt-12">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ivory/85"><CategoryIcon category={l.category} className="h-3.5 w-3.5 text-gold" />{t("one_" + l.category)}</p>
          <h3 className="break-words font-display text-base font-extrabold leading-tight" title={l.name}>{l.name}</h3>
        </div>
        {l.mine && <span className="absolute end-3 top-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-soil">{t("new_badge")}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-soil/80">{t("rate_label")}</p>
          <p className="flex flex-wrap items-baseline font-display text-2xl font-extrabold text-forest"><span dir="ltr">{pkr(l.rate)}</span><span className="text-sm font-semibold text-soil/80">{t("per_hour")}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-ivory px-2.5 py-1 text-sm font-bold text-soil ring-1 ring-soil/10">
            <MapPin className="h-4 w-4 text-leafink" aria-hidden="true" /><span dir="ltr">{l.distance}</span> {t("km")}{l.fromPin && <span className="text-[10px] font-semibold text-soil/80">({t("loc_road")})</span>}
          </span>
          <span className="text-xs text-soil/80">{l.village}, {dn(l.district)}{l.province && l.province !== "PB" ? `, ${provLabel(lang, l.country, l.province)}` : ""}</span>
        </div>
        <p className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-gold/15 px-2.5 py-1 text-xs font-bold text-soil ring-1 ring-gold/40">
          <Fuel className="h-3.5 w-3.5" aria-hidden="true" />{t("dry_rent")}
        </p>
        <ul className="space-y-1.5 text-sm text-soil/90">
          <li className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 shrink-0 text-leafink" aria-hidden="true" />{opText}</li>
          <li className="flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0 text-leafink" aria-hidden="true" />{trText}</li>
          {l.spec && <li className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0 text-leafink" aria-hidden="true" /><span dir="ltr">{l.spec}</span></li>}
        </ul>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-soil/10 pt-3 text-xs text-soil/80">
          <span className="inline-flex items-center gap-1"><BadgeCheck className="h-4 w-4 text-forest" aria-hidden="true" />{t("owner")}: {l.ownerId}</span>
          <span className="inline-flex items-center gap-1"><Star className="h-4 w-4 fill-gold text-gold" aria-hidden="true" />{l.rating.toFixed(1)}</span>
        </div>
        <button onClick={() => onBook(l)} disabled={!l.available}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-ivory shadow-sm transition-all duration-200 hover:bg-[#0f4a28] hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-soil/20 disabled:text-soil/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />{l.available ? t("request") : t("unavailable")}
        </button>
      </div>
    </article>
  );
}

function Marketplace({ t, dn, lang, listings, onBook, filters, setFilters, activeProvinces, userLoc, setUserLoc, onLive, country = "PK", setCountry, demoMode = false, fallbackProps }) {
  // short skeleton while listings settle (first paint and country switch)
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); const id = setTimeout(() => setReady(true), 420); return () => clearTimeout(id); }, [country]);
  const { category, province = "all", radius, query } = filters;
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return listings
      .filter((l) => (category === "all" || l.category === category))
      .filter((l) => (province === "all" || (l.province || "PB") === province))
      .filter((l) => l.distance <= radius)
      .filter((l) => !q || [l.name, l.village, l.district, l.ownerId].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.available - a.available) || a.distance - b.distance);
  }, [listings, category, province, radius, query]);
  // when nothing is inside the radius, still show the closest machines (with their real distance)
  const nearestBeyond = useMemo(() => (userLoc ? listings.filter((l) => l.available && (category === "all" || l.category === category) && l.distance > radius).sort((a, b) => a.distance - b.distance).slice(0, 3) : []), [listings, userLoc, category, radius]);
  const pct = ((radius - 1) / (MAX_RADIUS - 1)) * 100;

  return (
    <section id="market" className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="market-h">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h2 id="market-h" className="font-display text-2xl font-extrabold text-forest">{t("nav_market")}</h2>
        <p className="text-sm font-semibold text-soil/80" aria-live="polite">{t("results").replace("{n}", results.length)}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="h-fit rounded-2xl border border-soil/10 bg-white p-4 shadow-sm lg:sticky lg:top-24" aria-label={t("filters")}>
          <p className="mb-4 flex items-center gap-2 font-bold text-forest"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" />{t("filters")}</p>
          <div className="space-y-5">
            <div>
              {setCountry && <div className="mb-2"><CountrySelect t={t} country={country} setCountry={setCountry} id="country-market" /></div>}
              <LocationField t={t} lang={lang} id="my-loc" label={t("loc_your")} value={userLoc} onChange={setUserLoc} allowClear />
              <p className="mt-1 text-[11px] text-soil/80">{userLoc ? t("loc_dist_note") : t("loc_dist_hint")}</p>
            </div>
            <div className="relative">
              <label htmlFor="q" className="sr-only">{t("f_search")}</label>
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soil/80" aria-hidden="true" />
              <input id="q" value={query} onChange={(e) => set({ query: e.target.value })} placeholder={t("f_search")} className={inputCls + " ps-9"} />
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-soil">{t("f_category")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {["all", ...CATEGORIES.filter((c) => catalogCats(country).includes(c) || listings.some((l) => l.category === c))].map((c) => (
                  <button key={c} type="button" onClick={() => set({ category: c })} aria-pressed={category === c}
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-sm font-semibold ring-1 transition ${category === c ? "bg-forest text-ivory ring-forest" : "bg-ivory text-soil ring-soil/15 hover:ring-leaf"}`}>
                    {c !== "all" && <CategoryIcon category={c} className="h-4 w-4" />}{t("cat_" + c)}
                  </button>
                ))}
              </div>
            </fieldset>
            {country === "PK" && <Field label={t("f_province")} htmlFor="province">
              <select id="province" value={province} onChange={(e) => set({ province: e.target.value })} className={inputCls}>
                <option value="all">{t("all_provinces")}</option>
                {(activeProvinces || PROVINCES).map((c) => <option key={c} value={c}>{provName(lang, c)}</option>)}
              </select>
            </Field>}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="radius" className="text-sm font-semibold text-soil">{t("f_radius")}</label>
                <span className="rounded-lg bg-forest px-2 py-0.5 text-sm font-bold text-ivory">{radius} {t("km")}</span>
              </div>
              <input id="radius" type="range" min="1" max={MAX_RADIUS} step="1" value={radius} onChange={(e) => set({ radius: Number(e.target.value) })}
                className="range w-full" style={{ "--pct": pct + "%" }} aria-valuetext={`${radius} km`} />
              <div className="mt-1 flex justify-between text-[11px] text-soil/80" dir="ltr"><span>1</span><span>15</span><span>25 km</span></div>
              <p className="mt-1 text-xs text-soil/80">{t("radius_note")}</p>
            </div>
            <button type="button" onClick={() => setFilters({ category: "all", province: "all", radius: DEFAULT_RADIUS, query: "" })}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-soil/15 px-3 py-2 text-sm font-semibold text-soil hover:bg-ivory">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />{t("reset")}
            </button>
          </div>
        </aside>
        <div>
          <div className="mb-3 flex justify-end"><ModeBadge t={t} demo={demoMode} /></div>
          {results.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-soil/25 bg-white px-6 py-14 text-center">
              <Search className="h-10 w-10 text-soil/30" aria-hidden="true" />
              <p className="mt-3 max-w-md text-soil/80">{userLoc ? t("loc_far").replace("{km}", radius).replace("{place}", locLabel(userLoc)) : t("no_results")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => set({ radius: MAX_RADIUS, province: "all", category: "all", query: "" })} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">{t("reset")}</button>
                {userLoc && <button onClick={onLive} className="inline-flex items-center gap-1.5 rounded-xl bg-leafink px-4 py-2 text-sm font-bold text-white"><Radar className="h-4 w-4" aria-hidden="true" />{t("loc_try_live")}</button>}
              </div>
              {nearestBeyond.length === 0 && fallbackProps && !demoMode && (
                <div className="mt-6 w-full text-start">
                  <ZeroSupplyFallback {...fallbackProps} request={{ category, loc: userLoc, village: userLoc ? locLabel(userLoc) : "", district: userLoc ? userLoc.district : "", province: userLoc ? userLoc.province : "", country: CUR.id, hours: 4 }} pickCategory={category === "all"} onExpand={null} />
                </div>
              )}
              {nearestBeyond.length > 0 && (
                <div className="mt-8 w-full text-start">
                  <p className="mb-3 text-sm font-bold text-forest">{t("loc_nearest_beyond")}</p>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {nearestBeyond.map((l) => <ListingCard key={l.id} l={l} t={t} dn={dn} lang={lang} onBook={onBook} />)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {ready ? results.map((l) => <ListingCard key={l.id} l={l} t={t} dn={dn} lang={lang} onBook={onBook} />) : Array.from({ length: Math.max(3, Math.min(6, results.length)) }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Booking modal with transparent price calculator                     */
/* ------------------------------------------------------------------ */
function BookingModal({ listing, t, dn, onClose, onSubmit, session }) {
  const [date, setDate] = useState(addDaysISO(1));
  const [hours, setHours] = useState(4);
  const [wantOp, setWantOp] = useState(false);
  const [wantTr, setWantTr] = useState(false);
  const [ack, setAck] = useState(false);
  const [payment, setPayment] = useState("easypaisa");
  const [name, setName] = useState(() => (session && session.name) || store.get("agrishare.renter", {}).name || "");
  const [phone, setPhone] = useState(() => (session && session.phone) || store.get("agrishare.renter", {}).phone || "");
  const listedTr = transportFee(listing.distance);
  const minOffer = Math.ceil((listing.rate * MIN_OFFER_RATIO) / 50) * 50;
  const [offerOn, setOfferOn] = useState(false);
  const [offerRate, setOfferRate] = useState(listing.rate);
  const [offerTr, setOfferTr] = useState(listedTr);
  const [note, setNote] = useState("");
  const [smallholder, setSmallholder] = useState(false);
  const [partner, setPartner] = useState(CREDIT_PARTNERS[0]);
  const [dueDays, setDueDays] = useState(120);
  const [tried, setTried] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = dialogRef.current && dialogRef.current.querySelector("input,button,select");
    if (first) first.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const terms = offerOn ? { rate: Number(offerRate) || listing.rate, transport: Number(offerTr) >= 0 ? Number(offerTr) : listedTr } : null;
  const commissionRate = smallholder ? SMALLHOLDER_COMMISSION : COMMISSION;
  const q = quote(listing, hours, wantOp, wantTr, terms, commissionRate);
  const listedQ = quote(listing, hours, wantOp, wantTr, null, commissionRate);
  const payLater = payment === "paylater";
  const advance = Math.round(q.total * ADVANCE_SHARE);
  const balance = q.total - advance;
  const dueDate = (() => { const d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + Number(dueDays)); return d.toISOString().slice(0, 10); })();

  const validate = () => {
    const err = {};
    if (!date || date < todayISO()) err.date = t("err_date");
    if (!name.trim()) err.name = t("err_name");
    if (!/^03\d{9}$/.test(phone.replace(/[\s-]/g, ""))) err.phone = t("err_phone");
    if (!ack) err.ack = t("err_ack");
    if (offerOn) {
      const r = Number(offerRate);
      if (!(r >= minOffer && r <= listing.rate)) err.offer = t("bk_offer_min").replace("{min}", pkr(minOffer)).replace("{max}", pkr(listing.rate));
      const tr = Number(offerTr);
      if (listing.transport === "optional" && wantTr && !(tr >= 0 && tr <= listedTr)) err.offerTr = t("bk_offer_min").replace("{min}", pkr(0)).replace("{max}", pkr(listedTr));
    }
    return err;
  };
  const errors = tried ? validate() : {};

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validate()).length) return;
    store.set("agrishare.renter", { name: name.trim(), phone: phone.trim() });
    onSubmit({ date, hours: q.hours, operator: listing.operator === "optional" ? wantOp : listing.operator === "included", transport: listing.transport === "optional" ? wantTr : listing.transport === "included", payment, renterName: name.trim(), renterPhone: phone.replace(/[\s-]/g, ""), quote: q,
      offer: offerOn ? { rate: q.rate, transport: listing.transport === "optional" && wantTr ? q.transport : null, note: note.trim(), listedTotal: listedQ.total } : null,
      smallholder, financing: payLater ? { partner, advance, balance, dueDate, status: "pending" } : null });
  };

  const Row = ({ label, value, muted, strong }) => (
    <div className={`flex items-center justify-between gap-3 py-1.5 ${strong ? "text-base font-extrabold text-forest" : "text-sm"} ${muted ? "text-soil/80" : "text-soil"}`}>
      <span>{label}</span><span className="tabular-nums" dir="ltr">{value}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-soil/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bk-h" className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-ivory shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-soil/10 bg-ivory/95 px-5 py-4 backdrop-blur">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-gold"><CategoryIcon category={listing.category} className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h2 id="bk-h" className="font-display text-lg font-extrabold text-forest">{t("bk_title")}</h2>
            <p className="truncate text-sm text-soil/80">{listing.name} · {listing.village}, {dn(listing.district)} · {pkr(listing.rate)}{t("per_hour")}</p>
          </div>
          <button onClick={onClose} className="ms-auto rounded-lg p-2 text-soil hover:bg-soil/5" aria-label={t("close")}><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} noValidate className="grid gap-5 p-5 md:grid-cols-2 [&>*]:min-w-0">
          <div className="space-y-4">
            <Field label={t("bk_date")} htmlFor="bk-date" error={errors.date}>
              <input id="bk-date" type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </Field>
            <Field label={t("bk_hours")} htmlFor="bk-hours">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setHours((h) => Math.max(1, h - 1))} className="rounded-xl border border-soil/20 bg-white p-2.5 text-forest hover:bg-ivory" aria-label="Decrease hours"><Minus className="h-4 w-4" /></button>
                <input id="bk-hours" type="number" min="1" max="16" value={hours} onChange={(e) => setHours(Math.min(16, Math.max(1, parseInt(e.target.value || "1", 10))))} className={inputCls + " text-center font-bold"} />
                <button type="button" onClick={() => setHours((h) => Math.min(16, h + 1))} className="rounded-xl border border-soil/20 bg-white p-2.5 text-forest hover:bg-ivory" aria-label="Increase hours"><Plus className="h-4 w-4" /></button>
              </div>
            </Field>
            <Toggle id="bk-op" label={t("bk_operator") + " (+PKR 500/hr)"}
              sub={listing.operator === "included" ? t("op_included") : listing.operator === "none" ? t("op_none") : t("op_optional")}
              checked={listing.operator === "included" ? true : wantOp} disabled={listing.operator !== "optional"} onChange={setWantOp} />
            <Toggle id="bk-tr" label={`${t("bk_transport")} (+${pkr(listedTr)} · ${listing.distance} ${t("km")})`}
              sub={listing.transport === "included" ? t("tr_included") : listing.transport === "self" ? t("tr_self") : t("tr_optional")}
              checked={listing.transport === "included" ? true : wantTr} disabled={listing.transport !== "optional"} onChange={setWantTr} />
            <Toggle id="bk-small" label={t("bk_smallholder")} sub={t("bk_smallholder_sub")} checked={smallholder} onChange={setSmallholder} />
            <div className={`rounded-2xl p-1 ${offerOn ? "bg-gold/20 ring-1 ring-gold/60" : ""}`}>
              <Toggle id="bk-offer" label={t("bk_offer_toggle")} sub={t("bk_offer_sub")} checked={offerOn} onChange={setOfferOn} />
              {offerOn && (
                <div className="grid gap-3 p-2 pt-3">
                  <Field label={t("bk_offer_rate")} htmlFor="of-rate" error={errors.offer} hint={`${t("bk_listed")}: ${pkr(listing.rate)}${t("per_hour")} · min ${pkr(minOffer)}`}>
                    <MoneyInput id="of-rate" min={minOffer} max={listing.rate} step="50" value={offerRate} onChange={setOfferRate} className={inputCls} />
                  </Field>
                  {listing.transport === "optional" && wantTr && (
                    <Field label={t("bk_offer_tr")} htmlFor="of-tr" error={errors.offerTr} hint={`${t("bk_listed")}: ${pkr(listedTr)}`}>
                      <MoneyInput id="of-tr" min={0} max={listedTr} step="50" value={offerTr} onChange={setOfferTr} className={inputCls} />
                    </Field>
                  )}
                  <Field label={t("bk_offer_note")} htmlFor="of-note">
                    <textarea id="of-note" rows={2} maxLength={240} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("bk_offer_note_ph")} className={inputCls} />
                  </Field>
                </div>
              )}
            </div>
            <Field label={t("bk_name")} htmlFor="bk-name" error={errors.name}>
              <input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
            </Field>
            <Field label={t("bk_phone")} htmlFor="bk-phone" error={errors.phone} hint={t("bk_privacy")}>
              <input id="bk-phone" inputMode="tel" dir="ltr" placeholder="03XX XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} autoComplete="tel" />
            </Field>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-soil/10">
              <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest"><Calculator className="h-4 w-4" aria-hidden="true" />{t("bk_breakdown")}</p>
              {offerOn && <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold text-soil"><Tag className="h-3 w-3" aria-hidden="true" />{t("bk_your_offer")}</p>}
              <Row label={`${t("bk_base")} (${pkr(q.rate)} × ${q.hours}h)`} value={pkr(q.base)} />
              <Row label={`${t("bk_op")}${q.operator ? ` (500 × ${q.hours}h)` : ""}`} value={listing.operator === "included" ? t("included_word") : q.operator ? pkr(q.operator) : t("not_added")} muted={!q.operator} />
              <Row label={t("bk_tr")} value={listing.transport === "included" ? t("included_word") : q.transport ? pkr(q.transport) : t("not_added")} muted={!q.transport} />
              <div className="my-1 border-t border-dashed border-soil/20" />
              <Row label={t("bk_sub")} value={pkr(q.subtotal)} />
              <Row label={t("bk_comm").replace("{p}", pctLabel(q.commissionRate))} value={pkr(q.commission)} />
              <div className="my-1 border-t border-soil/20" />
              <Row label={t("bk_total")} value={pkr(q.total)} strong />
              {offerOn && q.total !== listedQ.total && <p className="text-end text-xs text-soil/80" dir="ltr">{t("bk_listed")}: <s>{pkr(listedQ.total)}</s> · −{pkr(listedQ.total - q.total)}</p>}
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-gold/15 p-2 text-xs font-semibold text-soil"><Fuel className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{t("bk_fuel_line")}</p>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-soil">{t("bk_pay")}</legend>
              <p className="mb-2 text-xs text-soil/80">{t("bk_pay_note")}</p>
              <div className="grid gap-2">
                {[["paylater", t("pay_paylater"), Sprout], ["easypaisa", t("pay_easypaisa"), Wallet], ["jazzcash", t("pay_jazzcash"), Smartphone], ["agent", t("pay_agent"), Users]].map(([v, l, Icon]) => (
                  <label key={v} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${payment === v ? "border-forest bg-forest/5 text-forest" : "border-soil/15 bg-white text-soil"}`}>
                    <input type="radio" name="payment" value={v} checked={payment === v} onChange={() => setPayment(v)} className="accent-forest" />
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{l}
                  </label>
                ))}
              </div>
              {payLater && (
                <div className="mt-2 space-y-3 rounded-xl border border-leaf/40 bg-leaf/10 p-3">
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-lg bg-white p-2 ring-1 ring-soil/10"><p className="text-[11px] font-semibold text-soil/80">{t("pl_now")}</p><p className="font-display text-lg font-extrabold text-forest" dir="ltr">{pkr(advance)}</p></div>
                    <div className="rounded-lg bg-white p-2 ring-1 ring-soil/10"><p className="text-[11px] font-semibold text-soil/80">{t("pl_later")}</p><p className="font-display text-lg font-extrabold text-soil" dir="ltr">{pkr(balance)}</p></div>
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-xs font-bold text-soil">{t("pl_partner")}</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {CREDIT_PARTNERS.map((pt) => (
                        <button type="button" key={pt} onClick={() => setPartner(pt)} aria-pressed={partner === pt}
                          className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${partner === pt ? "bg-forest text-ivory ring-forest" : "bg-white text-soil ring-soil/20"}`}>{pt}</button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-xs font-bold text-soil" htmlFor="pl-due">{t("pl_due")}
                    <select id="pl-due" value={dueDays} onChange={(e) => setDueDays(e.target.value)} className={inputCls + " mt-1 py-2 text-sm font-normal"}>
                      {[60, 90, 120, 150, 180].map((d) => <option key={d} value={d}>{d} {t("pl_days")}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-soil" dir="ltr">{t("pl_due_on")}: <b>{fmtDate(dueDate)}</b></p>
                  <p className="flex items-start gap-1.5 text-[11px] leading-snug text-soil/80"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest" aria-hidden="true" />{t("pl_risk")}</p>
                </div>
              )}
            </fieldset>
            <div>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${errors.ack ? "border-red-400 bg-red-50" : "border-soil/15 bg-white"}`}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-forest" />
                <span className="text-soil">{t("bk_ack")}</span>
              </label>
              {errors.ack && <p className="mt-1 text-xs font-medium text-red-700">{errors.ack}</p>}
            </div>
            <div className="flex min-w-0 flex-col-reverse gap-2">
              <button type="button" onClick={onClose} className="rounded-xl border border-soil/20 px-4 py-2.5 text-sm font-bold text-soil hover:bg-white">{t("cancel")}</button>
              <button type="submit" className="flex-wrap inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory hover:bg-[#0f4a28] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
                {offerOn ? <Tag className="h-4 w-4" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}{offerOn ? t("bk_send_offer") : t("bk_submit")} · <span dir="ltr">{payLater ? `${pkr(advance)} ${t("pl_now_short")}` : pkr(q.total)}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My Bookings                                                         */
/* ------------------------------------------------------------------ */
function StatusTracker({ status, t }) {
  const idx = status === "countered" ? 0 : STATUS_FLOW.indexOf(status);
  const stopped = status === "declined" || status === "cancelled";
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Booking status">
      {STATUS_FLOW.map((s, i) => {
        const done = !stopped && i <= idx;
        const current = !stopped && i === idx;
        return (
          <li key={s} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-1 flex-1 rounded ${i === 0 ? "invisible" : done ? "bg-leaf" : "bg-soil/15"}`} />
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-leafink text-white" : "bg-soil/10 text-soil/80"} ${current ? "ring-4 ring-leaf/25" : ""}`}>
                {done ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`h-1 flex-1 rounded ${i === STATUS_FLOW.length - 1 ? "invisible" : !stopped && i < idx ? "bg-leaf" : "bg-soil/15"}`} />
            </div>
            <span className={`mt-1 text-[11px] font-semibold leading-tight ${done ? "text-forest" : "text-soil/80"}`}>{t("st_" + s)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function FeedbackForm({ t, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (rating) onSubmit(rating, comment.trim()); }} className="mt-3 space-y-2 rounded-xl bg-ivory p-3">
      <p className="text-sm font-semibold text-soil">{t("mb_rate")}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={t("mb_rate")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} role="radio" aria-checked={rating === n} aria-label={`${n} star`} className="rounded p-0.5">
            <Star className={`h-7 w-7 ${n <= rating ? "fill-gold text-gold" : "text-soil/30"}`} />
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="fb-c">{t("mb_comment")}</label>
      <textarea id="fb-c" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("mb_comment")} className={inputCls} />
      <button type="submit" disabled={!rating} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory disabled:opacity-40">{t("mb_feedback")}</button>
    </form>
  );
}

function CounterOfferBox({ b, t, updateBooking }) {
  const c = b.counter;
  const snap = b.listingSnap || { rate: b.quote.listedRate || b.quote.rate, operator: "included", transport: "optional", distance: 0 };
  const nq = quote(snap, b.quote.hours, b.operator, b.transport && b.quote.transport > 0, { rate: c.rate, transport: c.transport }, b.smallholder ? SMALLHOLDER_COMMISSION : COMMISSION);
  return (
    <div className="mt-3 rounded-xl border border-gold/60 bg-gold/10 p-3">
      <p className="flex items-center gap-2 text-sm font-bold text-soil"><Repeat className="h-4 w-4" aria-hidden="true" />{t("mb_counter")}</p>
      <p className="mt-1 text-sm text-soil" dir="ltr">{pkr(c.rate)}/hr{nq.transport ? ` · Transport ${pkr(nq.transport)}` : ""} · <b>Total {pkr(nq.total)}</b></p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => updateBooking(b.id, "confirmed", { quote: nq, agreed: { rate: c.rate, transport: c.transport }, financing: b.financing ? { ...b.financing, advance: Math.round(nq.total * ADVANCE_SHARE), balance: nq.total - Math.round(nq.total * ADVANCE_SHARE) } : null })} className="inline-flex items-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-bold text-ivory"><Check className="h-4 w-4" aria-hidden="true" />{t("mb_accept_counter")}</button>
        <button onClick={() => updateBooking(b.id, "cancelled")} className="rounded-lg border border-soil/20 px-3 py-2 text-sm font-bold text-soil">{t("mb_decline_counter")}</button>
      </div>
    </div>
  );
}

function MyBookings({ t, dn, bookings, updateBooking, setTab, session, openAuth, onVoucher }) {
  if (!session) {
    return (
      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h2 className="mb-5 font-display text-2xl font-extrabold text-forest">{t("mb_title")}</h2>
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-soil/25 bg-white px-6 py-14 text-center">
          <LogIn className="h-10 w-10 text-soil/30" aria-hidden="true" />
          <p className="mt-3 text-soil/80">{t("mb_signin")}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => openAuth("signin")} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">{t("auth_signin")}</button>
            <button onClick={() => openAuth("signup")} className="rounded-xl border border-forest/30 px-4 py-2 text-sm font-bold text-forest">{t("auth_signup")}</button>
          </div>
        </div>
      </section>
    );
  }
  const mine = bookings.filter((b) => b.channel === "ussd" || !b.renterEmail || b.renterEmail === session.email);
  const sorted = [...mine].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-labelledby="mb-h">
      <h2 id="mb-h" className="mb-5 font-display text-2xl font-extrabold text-forest">{t("mb_title")}</h2>
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-soil/25 bg-white px-6 py-14 text-center">
          <ClipboardList className="h-10 w-10 text-soil/30" aria-hidden="true" />
          <p className="mt-3 text-soil/80">{t("mb_empty")}</p>
          <button onClick={() => setTab("marketplace")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory"><Store className="h-4 w-4" aria-hidden="true" />{t("nav_market")}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((b) => (
            <article key={b.id} className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-forest text-gold"><CategoryIcon category={b.category} className="h-6 w-6" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-extrabold text-forest">{b.listingName}</h3>
                    <StatusPill status={b.status} t={t} />
                  </div>
                  <p className="mt-0.5 text-sm text-soil/80">
                    <span dir="ltr" className="font-mono font-semibold">{b.id}</span> · {fmtDate(b.date)} · {b.quote.hours}h · {dn(b.district)} · {b.channel === "ussd" ? t("mb_via_ussd") : b.channel === "live" ? t("mb_via_live") : t("mb_via_app")}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-soil/80">{t("bk_total")}</p>
                  <p className="font-display text-xl font-extrabold text-forest" dir="ltr">{pkr(b.quote.total)}</p>
                </div>
              </div>
              <div className="mt-4"><StatusTracker status={b.status} t={t} /></div>
              {onVoucher && <button onClick={() => onVoucher(b.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-forest/5 px-3 py-1.5 text-xs font-bold text-forest ring-1 ring-forest/15 transition hover:bg-forest/10"><Ticket className="h-4 w-4" aria-hidden="true" />{t("act_view_voucher")} <span className="font-mono" dir="ltr">{voucherCode(b)}</span></button>}
              <div className="mt-3 grid gap-x-6 gap-y-1 rounded-xl bg-ivory p-3 text-xs text-soil sm:grid-cols-2">
                <span>{t("bk_base")}: <b dir="ltr">{pkr(b.quote.base)}</b></span>
                <span>{t("bk_op")}: <b>{b.quote.operator ? pkr(b.quote.operator) : b.operator ? t("included_word") : t("not_added")}</b></span>
                <span>{t("bk_tr")}: <b>{b.quote.transport ? pkr(b.quote.transport) : b.transport ? t("included_word") : t("not_added")}</b></span>
                <span>{t("bk_comm").replace("{p}", pctLabel(b.quote.commissionRate || (b.quote.subtotal ? b.quote.commission / b.quote.subtotal : COMMISSION)))}: <b dir="ltr">{pkr(b.quote.commission)}</b></span>
                <span>{t("bk_pay")}: <b>{t("pay_" + b.payment)}</b></span>
                <span>{t("owner")}: <b dir="ltr">{b.ownerId}</b></span>
              </div>
              {b.offer && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-soil">
                  <span className="inline-flex items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 font-bold"><Tag className="h-3 w-3" aria-hidden="true" />{t("offer_badge")}</span>
                  <span dir="ltr">{t("mb_offer_line").replace("{rate}", pkr(b.offer.rate))} · {t("bk_listed")} {pkr(b.quote.listedRate)}/hr</span>
                  {b.offer.note && <span className="italic text-soil/80">"{b.offer.note}"</span>}
                </p>
              )}
              {b.financing && !["cancelled", "declined"].includes(b.status) && (
                <div className={`mt-3 rounded-xl p-3 text-sm ring-1 ${b.financing.status === "settled" ? "bg-leaf/10 ring-leaf/40" : "bg-gold/10 ring-gold/50"}`}>
                  <p className="flex flex-wrap items-center gap-2 font-bold text-soil"><Sprout className="h-4 w-4 text-forest" aria-hidden="true" />{t("pay_paylater")} · {b.financing.partner}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${b.financing.status === "settled" ? "bg-forest text-ivory" : "bg-gold text-soil"}`}>{b.financing.status === "settled" ? t("pl_settled") : t("pl_pending")}</span>
                  </p>
                  <p className="mt-1 text-xs text-soil" dir="ltr">{t("pl_now")}: <b>{pkr(b.financing.advance)}</b> · {t("pl_later")}: <b>{pkr(b.financing.balance)}</b> · {t("pl_due_on")} {fmtDate(b.financing.dueDate)}</p>
                  {b.financing.status === "settled" && b.financing.settledBy && <p className="mt-1 text-xs text-forest">{t("pl_settled_by").replace("{id}", b.financing.settledBy)}</p>}
                  {b.financing.status !== "settled" && <button onClick={() => setTab("agri-mandi")} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-xs font-bold text-ivory"><Wheat className="h-3.5 w-3.5" aria-hidden="true" />{t("pl_settle_mandi")}</button>}
                </div>
              )}
              {b.status === "countered" && b.counter && <CounterOfferBox b={b} t={t} updateBooking={updateBooking} />}
              {b.status === "sent" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="flex flex-1 items-center gap-2 text-sm text-soil/80"><Hourglass className="h-4 w-4 text-gold" aria-hidden="true" />{t("mb_waiting")}</p>
                  <button onClick={() => setTab("owner-portal")} className="rounded-xl bg-forest/5 px-3 py-2 text-sm font-bold text-forest hover:bg-forest/10">{t("mb_go_owner")}</button>
                  <button onClick={() => updateBooking(b.id, "cancelled")} className="rounded-xl border border-soil/20 px-3 py-2 text-sm font-bold text-soil hover:bg-ivory">{t("mb_cancel")}</button>
                </div>
              )}
              {b.status === "confirmed" && (
                <button onClick={() => updateBooking(b.id, "completed")} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory hover:bg-[#0f4a28]">
                  <CircleCheck className="h-4 w-4" aria-hidden="true" />{t("mb_complete")}
                </button>
              )}
              {b.status === "completed" && <FeedbackForm t={t} onSubmit={(rating, comment) => updateBooking(b.id, "feedback", { rating, comment })} />}
              {b.status === "feedback" && (
                <p className="mt-3 flex items-center gap-2 text-sm text-forest">
                  <span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= (b.rating || 0) ? "fill-gold text-gold" : "text-soil/25"}`} aria-hidden="true" />)}</span>
                  {t("mb_thanks")}{b.comment ? ` "${b.comment}"` : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Owner Portal                                                        */
/* ------------------------------------------------------------------ */
function ListMachineForm({ t, dn, lang, onAdd, session }) {
  const sessLoc = session && session.location && locCountry(session.location) === CUR.id ? session.location : null;
  const blank = { name: "", category: "tractor", loc: sessLoc, distance: 5, rate: Math.round(askFor("tractor", 2500)), operator: "optional", transport: "optional", ownerName: (session && session.name) || "", ownerPhone: (session && session.phone) || "", spec: "" };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const validate = () => {
    const err = {};
    if (f.name.trim().length < 3) err.name = "Required";
    if (!f.loc) err.loc = t("loc_err");
    if (!f.ownerName.trim()) err.ownerName = "Required";
    if (!/^\+?\d{10,13}$/.test(f.ownerPhone.replace(/[\s-]/g, ""))) err.ownerPhone = t("err_phone");
    const rate = Number(f.rate);
    if (!(rate >= 500 && rate <= 500000)) err.rate = `${pkr(500)} to ${pkr(500000)}`;
    return err;
  };
  const errors = tried ? validate() : {};
  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validate()).length) return;
    const rate = Number(f.rate);
    const { loc, ...rest } = f;
    // distance 5 km is only a fallback shown to renters who have not set their own location
    onAdd({ ...rest, name: f.name.trim(), ownerName: f.ownerName.trim(), ownerPhone: f.ownerPhone.replace(/[\s-]/g, ""), spec: f.spec.trim(), rentType: "dry", rate: Math.round(rate), distance: 5, country: loc.country || CUR.id,
      province: loc.province, district: loc.district, village: loc.village || loc.district, lat: loc.lat, lng: loc.lng });
    setF(blank);
    setTried(false);
  };
  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label={t("ow_name")} htmlFor="m-name" error={errors.name}><input id="m-name" value={f.name} onChange={set("name")} placeholder="e.g. Millat Massey 260 Tractor" className={inputCls} /></Field></div>
      <Field label={t("ow_cat")} htmlFor="m-cat">
        <select id="m-cat" value={f.category} onChange={set("category")} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{t("one_" + c)}</option>)}</select>
      </Field>
      <Field label={t("ow_rate")} htmlFor="m-rate" error={errors.rate}><MoneyInput id="m-rate" min={500} step="100" value={f.rate} onChange={(v) => setF((s) => ({ ...s, rate: v }))} className={inputCls} /></Field>
      {CUR.catalog.some((m) => m.cat === f.category) && (
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-semibold text-soil">{t("ow_suggest").replace("{country}", t("country_" + CUR.id))}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CUR.catalog.filter((m) => m.cat === f.category).map((m) => (
              <button type="button" key={m.name} onClick={() => setF((s) => ({ ...s, name: m.name, spec: m.spec, rate: Math.round(((m.min + m.max) / 2) / CUR.fx) }))} aria-pressed={f.name === m.name}
                className={`flex items-center gap-2 overflow-hidden rounded-xl text-start ring-1 transition ${f.name === m.name ? "bg-forest/5 ring-forest" : "bg-white ring-soil/15 hover:ring-leaf"}`}>
                <MachinePhoto category={m.cat} name={m.name} className="h-14 w-16 shrink-0" alt={m.name} width={128} height={112} />
                <span className="min-w-0 py-1 pe-2">
                  <span className="block truncate text-sm font-bold text-forest" dir="ltr">{m.name}</span>
                  <span className="block truncate text-[11px] text-soil/80" dir="ltr">{m.spec} · {fmtLocal(m.min)} to {fmtLocal(m.max)}/hr</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sm:col-span-2"><LocationField t={t} lang={lang} id="m-loc" label={t("loc_machine")} value={f.loc} onChange={(loc) => setF((s) => ({ ...s, loc }))} error={errors.loc} /></div>
      <Field label={t("ow_ownername")} htmlFor="m-own" error={errors.ownerName}><input id="m-own" value={f.ownerName} onChange={set("ownerName")} className={inputCls} /></Field>
      <Field label={t("ow_ownerphone")} htmlFor="m-phone" error={errors.ownerPhone}><input id="m-phone" type="tel" inputMode="tel" autoComplete="tel" value={f.ownerPhone} onChange={set("ownerPhone")} placeholder="0300 1234567" className={inputCls} dir="ltr" /></Field>
      <Field label={t("ow_opterm")} htmlFor="m-op">
        <select id="m-op" value={f.operator} onChange={set("operator")} className={inputCls}>
          <option value="included">{t("op_included")}</option><option value="optional">{t("op_optional")}</option><option value="none">{t("op_none")}</option>
        </select>
      </Field>
      <Field label={t("ow_trterm")} htmlFor="m-tr">
        <select id="m-tr" value={f.transport} onChange={set("transport")} className={inputCls}>
          <option value="included">{t("tr_included")}</option><option value="optional">{t("tr_optional")}</option><option value="self">{t("tr_self")}</option>
        </select>
      </Field>
      <div className="sm:col-span-2"><Field label={t("ow_spec")} htmlFor="m-spec"><input id="m-spec" value={f.spec} onChange={set("spec")} placeholder="e.g. 60 HP, rotavator included" className={inputCls} /></Field></div>
      <p className="flex items-center gap-2 rounded-xl bg-gold/15 p-3 text-sm font-semibold text-soil sm:col-span-2"><Fuel className="h-4 w-4 shrink-0" aria-hidden="true" />{t("ow_fuel")}</p>
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory hover:bg-[#0f4a28] sm:col-span-2">
        <Plus className="h-4 w-4" aria-hidden="true" />{t("ow_submit")}
      </button>
    </form>
  );
}

function RangeField({ id, label, value, set, min, max, unit }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><label htmlFor={id} className="font-semibold text-soil">{label}</label><span className="font-bold text-forest" dir="ltr">{value}{unit}</span></div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => set(Number(e.target.value))} className="range w-full" style={{ "--pct": ((value - min) / (max - min)) * 100 + "%" }} />
    </div>
  );
}

function EarningsEstimator({ t, listings, bookings }) {
  const [machineId, setMachineId] = useState(listings[0] ? listings[0].id : "");
  const [hoursDay, setHoursDay] = useState(8);
  const [days, setDays] = useState(30);
  const [util, setUtil] = useState(60);
  const machine = listings.find((l) => l.id === machineId) || listings[0];
  const rate = machine ? machine.rate : 0;
  const potential = rate * hoursDay * days;
  const expected = Math.round(potential * (util / 100));
  const earned = bookings.filter((b) => ["confirmed", "completed", "feedback"].includes(b.status)).reduce((s, b) => s + b.quote.subtotal, 0);
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="space-y-4">
        <Field label={t("es_machine")} htmlFor="es-m">
          <select id="es-m" value={machine ? machine.id : ""} onChange={(e) => setMachineId(e.target.value)} className={inputCls}>
            {listings.map((l) => <option key={l.id} value={l.id}>{l.name} · {pkr(l.rate)}/hr</option>)}
          </select>
        </Field>
        <RangeField id="es-h" label={t("es_hours")} value={hoursDay} set={setHoursDay} min={1} max={14} unit=" h" />
        <RangeField id="es-d" label={t("es_days")} value={days} set={setDays} min={5} max={90} unit=" d" />
        <RangeField id="es-u" label={t("es_util")} value={util} set={setUtil} min={10} max={100} unit="%" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl bg-forest p-5 text-ivory">
          <p className="text-sm text-ivory/80">{t("es_result")}</p>
          <p className="mt-1 font-display text-4xl font-extrabold text-gold" dir="ltr">{pkr(expected)}</p>
          <p className="text-sm text-ivory/80">{t("es_month")} · <span dir="ltr">{pkr(rate)} × {hoursDay}h × {days}d × {util}%</span></p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-ivory/15" aria-hidden="true"><div className="h-full rounded-full bg-gold transition-all" style={{ width: util + "%" }} /></div>
          <p className="mt-1 text-xs text-ivory/80" dir="ltr">Max potential: {pkr(potential)}</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-soil/10">
          <p className="text-sm text-soil/80">{t("es_confirmed")}</p>
          <p className="font-display text-2xl font-extrabold text-forest" dir="ltr">{pkr(earned)}</p>
        </div>
        <p className="flex items-start gap-2 text-xs text-soil/80"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("es_note")}</p>
      </div>
    </div>
  );
}

function PendingRequest({ b, t, updateBooking }) {
  const [countering, setCountering] = useState(false);
  const snap = b.listingSnap || { rate: b.quote.listedRate || b.quote.rate, operator: "included", transport: "optional", distance: 0 };
  const listedTr = transportFee(snap.distance);
  const hasTr = b.quote.transport > 0;
  const [cRate, setCRate] = useState(() => (b.offer ? Math.round((b.offer.rate + snap.rate) / 2 / 50) * 50 : snap.rate));
  const [cTr, setCTr] = useState(() => (hasTr ? (b.offer && b.offer.transport != null ? Math.round((b.offer.transport + listedTr) / 2 / 50) * 50 : listedTr) : 0));
  const sendCounter = (e) => {
    e.preventDefault();
    const r = Math.max(1, Number(cRate) || snap.rate);
    updateBooking(b.id, "countered", { counter: { rate: r, transport: hasTr ? Math.max(0, Number(cTr) || 0) : null } });
  };
  return (
    <li className={`rounded-xl border p-3 ${b.offer ? "border-gold bg-gold/10" : "border-gold/40 bg-gold/5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-forest">{b.listingName}</p>
          <p className="text-xs text-soil/80"><span dir="ltr" className="font-mono">{b.id}</span> · {fmtDate(b.date)} · {b.quote.hours}h · {b.renterName} {b.channel === "ussd" ? "· USSD" : ""}</p>
          <p className="mt-1 text-xs text-soil/80">{t("bk_op")}: {b.operator ? t("included_word") : t("not_added")} · {t("bk_tr")}: {b.transport ? t("included_word") : t("not_added")} · <Fuel className="inline h-3 w-3" aria-hidden="true" /> {t("dry_rent")}</p>
        </div>
        <p className="font-display text-lg font-extrabold text-forest" dir="ltr">{pkr(b.quote.subtotal)}</p>
      </div>
      {b.offer && (
        <div className="mt-2 rounded-lg bg-white/70 p-2 text-xs text-soil ring-1 ring-gold/40">
          <p className="flex items-center gap-1 font-bold"><Tag className="h-3.5 w-3.5" aria-hidden="true" />{t("ow_offer_from")}</p>
          <p dir="ltr">{pkr(b.offer.rate)}/hr (listed {pkr(snap.rate)}){b.offer.transport != null ? ` · Transport ${pkr(b.offer.transport)} (listed ${pkr(listedTr)})` : ""}</p>
          {b.offer.note && <p className="mt-1 flex items-start gap-1 italic"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />"{b.offer.note}"</p>}
        </div>
      )}
      {countering ? (
        <form onSubmit={sendCounter} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("ow_counter_rate")} htmlFor={"cr-" + b.id}><MoneyInput id={"cr-" + b.id} min={100} step="50" value={cRate} onChange={setCRate} className={inputCls} /></Field>
          {hasTr ? <Field label={t("ow_counter_tr")} htmlFor={"ct-" + b.id}><MoneyInput id={"ct-" + b.id} min={0} step="50" value={cTr} onChange={setCTr} className={inputCls} /></Field> : <span />}
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-forest px-3 py-2.5 text-sm font-bold text-ivory">{t("ow_send_counter")}</button>
            <button type="button" onClick={() => setCountering(false)} className="rounded-lg border border-soil/20 px-3 py-2.5 text-sm font-bold text-soil" aria-label={t("cancel")}><X className="h-4 w-4" /></button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => updateBooking(b.id, "confirmed")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-bold text-ivory hover:bg-[#0f4a28]"><Check className="h-4 w-4" aria-hidden="true" />{b.offer ? t("ow_accept_offer") : t("ow_approve")}</button>
          <button onClick={() => setCountering(true)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold bg-white px-3 py-2 text-sm font-bold text-soil hover:bg-gold/10"><Repeat className="h-4 w-4" aria-hidden="true" />{t("ow_counter")}</button>
          <button onClick={() => updateBooking(b.id, "declined")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800 hover:bg-red-50"><Ban className="h-4 w-4" aria-hidden="true" />{t("ow_decline")}</button>
        </div>
      )}
    </li>
  );
}

function OwnerPortal({ t, dn, lang, listings, bookings, addListing, toggleListing, removeListing, updateBooking, initialSub, session, demand = [] }) {
  const [sub, setSub] = useState(initialSub || "requests");
  useEffect(() => { if (initialSub) setSub(initialSub); }, [initialSub]);
  const pending = bookings.filter((b) => b.status === "sent").sort((a, b) => a.createdAt - b.createdAt);
  const responded = bookings.filter((b) => b.status !== "sent").sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const subs = [
    { key: "requests", label: t("ow_requests"), icon: ClipboardList, badge: pending.length },
    { key: "list", label: t("ow_list"), icon: Plus },
    { key: "earnings", label: t("ow_earn"), icon: Calculator },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="ow-h">
      <div className="mb-5">
        <h2 id="ow-h" className="font-display text-2xl font-extrabold text-forest">{t("ow_title")}</h2>
        <p className="mt-1 flex items-center gap-2 text-sm text-soil/80"><Coins className="h-4 w-4 text-gold" aria-hidden="true" />{t("hero_owner")} <span className="text-soil/80">· {t("ow_sub")}</span></p>
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {subs.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} role="tab" aria-selected={sub === key} onClick={() => setSub(key)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ring-1 ${sub === key ? "bg-forest text-ivory ring-forest" : "bg-white text-forest ring-soil/15 hover:ring-leaf"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}{badge ? <span className="rounded-full bg-gold px-1.5 text-[11px] text-soil">{badge}</span> : null}
          </button>
        ))}
      </div>

      {sub === "requests" && <WaitingDemand t={t} dn={dn} demand={demand} session={session} onList={() => setSub("list")} />}
      {sub === "requests" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-forest"><Hourglass className="h-4 w-4 text-gold" aria-hidden="true" />{t("ow_pending")} ({pending.length})</h3>
            {pending.length === 0 ? <p className="rounded-xl bg-ivory p-4 text-sm text-soil/80">{t("ow_no_req")}</p> : (
              <ul className="space-y-3">
                {pending.map((b) => <PendingRequest key={b.id} b={b} t={t} updateBooking={updateBooking} />)}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-forest"><CircleCheck className="h-4 w-4 text-leafink" aria-hidden="true" />{t("ow_history")}</h3>
            {responded.length === 0 ? <p className="rounded-xl bg-ivory p-4 text-sm text-soil/80">{t("ow_no_history")}</p> : (
              <ul className="divide-y divide-soil/10">
                {responded.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-semibold text-soil">{b.listingName}</span><span className="text-xs text-soil/80" dir="ltr">{b.id} · {fmtDate(b.date)}</span></span>
                    <StatusPill status={b.status} t={t} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {sub === "list" && (
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 font-bold text-forest"><Plus className="h-4 w-4" aria-hidden="true" />{t("ow_list")}</h3>
            <ListMachineForm key={session ? session.email : "guest"} t={t} dn={dn} lang={lang} onAdd={addListing} session={session} />
          </div>
          <div className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-forest"><Tractor className="h-4 w-4" aria-hidden="true" />{t("ow_my")} ({listings.length})</h3>
            <ul className="max-h-[560px] space-y-2 overflow-y-auto pe-1">
              {[...listings].sort((a, b) => ((b.status === "pending") - (a.status === "pending")) || ((b.submittedAt || 0) - (a.submittedAt || 0))).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ivory p-2.5">
                  <CategoryIcon category={l.category} className="h-5 w-5 shrink-0 text-forest" />
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="break-words text-sm font-semibold text-soil">{l.name}</span><ListingStatusPill status={l.status} t={t} /></span>
                    <span className="block break-words text-xs text-soil/80" dir="ltr">{pkr(l.rate)}/hr · {l.distance} km · {l.ownerId}</span>
                  </span>
                  <span className="ms-auto flex shrink-0 items-center gap-1">
                  <button onClick={() => toggleListing(l.id)} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${l.available ? "bg-leaf/15 text-forest" : "bg-soil/10 text-soil/80"}`} aria-pressed={l.available}>
                    {l.available ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}{l.available ? t("ow_available") : t("ow_hidden")}
                  </button>
                  {l.mine && <button onClick={() => removeListing(l.id)} className="rounded-lg p-1.5 text-red-700 hover:bg-red-50" aria-label={t("ow_remove")}><Trash2 className="h-4 w-4" /></button>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {sub === "earnings" && (
        <div className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 font-bold text-forest"><Calculator className="h-4 w-4" aria-hidden="true" />{t("ow_earn")}</h3>
          <EarningsEstimator t={t} listings={listings} bookings={bookings} />
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* USSD simulator (Appendix C, 7 steps)                                */
/* ------------------------------------------------------------------ */
const USSD_STEPS = [
  "Select language (Punjabi / Urdu / Sindhi)",
  "Choose machine type (Tractor / Thresher / Harvester)",
  "Select date, duration & location",
  "View machine option, owner identifier & rate",
  "Review total price & dry-rent terms",
  "Owner confirmation & SMS booking record",
  "Post-rental completion & feedback",
];
const PHASE_STEP = { idle: 0, lang: 1, type: 2, date: 3, hours: 3, loc: 3, options: 4, operator: 5, transport: 5, review: 5, pending: 6, confirmed: 6, complete: 7, rating: 7, done: 7 };

// Roman script copy for USSD screens (GSM friendly, as USSD menus usually are)
const U = {
  pa: {
    type: "Machine di qisam chuno:\n1. Tractor\n2. Thresher\n3. Harvester", date: "Tareekh chuno:\n1. Kal ({d1})\n2. Parson ({d2})\n3. {d3}", hours: "Kinne ghante? (1-16)\nNumber likh ke bhejo", loc: "Nazdeeki ilaqa chuno:\n1. Lahore Rural\n2. Kasur\n3. Sheikhupura\n4. Okara\n5. Faisalabad\n6. Sahiwal",
    options: "Machinan:", none: "Is qisam di koi machine nahi labhi.\n0. Wapis", operator: "Operator chahida? (+Rs500/ghanta)\n1. Haan\n2. Nahi", transport: "Transport chahidi? (+Rs{fee})\n1. Haan\n2. Nahi",
    review: "Kul: Rs{total}\nKiraya Rs{base} + Op Rs{op} + Trans Rs{tr} + Fee 6% Rs{comm}\nDiesel: tusi dena (dry rent)\nVadh time: maalik naal tay\n1. Confirm  2. Cancel",
    pending: "Maalik {owner} nu request ghal ditti.\nTasdeeq di udeek...", confirmed: "SMS: Agri-Share booking {id} PAKKI.\n{machine}, {date}, {h} ghante, Rs{total}.\n1. Rental mukammal",
    complete: "Kya kiraya mukammal hoya?\n1. Haan\n2. Masla report karo", rating: "Rating dio (1-5):", done: "Shukriya! Feedback record ho gaya.\nEnd dabao.", issue: "Shikayat record. Agri-Agent rabta karega.\nEnd dabao.",
    cancelled: "Booking cancel. End dabao.", invalid: "Ghalat input. Dobara koshish karo.",
  },
  ur: {
    type: "Machine ki qisam chunein:\n1. Tractor\n2. Thresher\n3. Harvester", date: "Tareekh chunein:\n1. Kal ({d1})\n2. Parson ({d2})\n3. {d3}", hours: "Kitne ghante? (1-16)\nNumber likh kar bhejein", loc: "Qareebi ilaqa chunein:\n1. Lahore Rural\n2. Kasur\n3. Sheikhupura\n4. Okara\n5. Faisalabad\n6. Sahiwal",
    options: "Machines:", none: "Is qisam ki koi machine nahi mili.\n0. Wapis", operator: "Operator chahiye? (+Rs500/ghanta)\n1. Haan\n2. Nahi", transport: "Transport chahiye? (+Rs{fee})\n1. Haan\n2. Nahi",
    review: "Kul: Rs{total}\nKiraya Rs{base} + Op Rs{op} + Trans Rs{tr} + Fee 6% Rs{comm}\nDiesel: aap ka (dry rent)\nZaid waqt: maalik se tay\n1. Confirm  2. Cancel",
    pending: "Maalik {owner} ko request bhej di.\nTasdeeq ka intezar...", confirmed: "SMS: Agri-Share booking {id} CONFIRMED.\n{machine}, {date}, {h} ghante, Rs{total}.\n1. Rental mukammal",
    complete: "Kya kiraya mukammal hua?\n1. Haan\n2. Masla report karein", rating: "Rating dein (1-5):", done: "Shukriya! Feedback record ho gaya.\nEnd dabayein.", issue: "Shikayat record. Agri-Agent rabta karega.\nEnd dabayein.",
    cancelled: "Booking cancel. End dabayein.", invalid: "Ghalat input. Dobara koshish karein.",
  },
  sd: {
    type: "Mashin jo qisam chundiyo:\n1. Tractor\n2. Thresher\n3. Harvester", date: "Tareekh chundiyo:\n1. Subhaane ({d1})\n2. Pareenh ({d2})\n3. {d3}", hours: "Ketra kalak? (1-16)\nNumber likhi moklyo", loc: "Wejho ilaiqo chundiyo:\n1. Lahore Rural\n2. Kasur\n3. Sheikhupura\n4. Okara\n5. Faisalabad\n6. Sahiwal",
    options: "Mashinoon:", none: "Hin qisam ji ka mashin na mili.\n0. Wapas", operator: "Operator khape? (+Rs500/kalak)\n1. Ha\n2. Na", transport: "Transport khape? (+Rs{fee})\n1. Ha\n2. Na",
    review: "Kul: Rs{total}\nKirayo Rs{base} + Op Rs{op} + Trans Rs{tr} + Fee 6% Rs{comm}\nDiesel: awhan jo (dry rent)\nWadheek waqt: malik san tay\n1. Confirm  2. Cancel",
    pending: "Malik {owner} khe darkhwast moklee wai.\nTasdeeq jo intezar...", confirmed: "SMS: Agri-Share booking {id} CONFIRMED.\n{machine}, {date}, {h} kalak, Rs{total}.\n1. Kirayo mukammal",
    complete: "Chha kirayo mukammal thyo?\n1. Ha\n2. Masilo report karyo", rating: "Rating dyo (1-5):", done: "Meharbani! Rai record thi wai.\nEnd dabayo.", issue: "Shikayat record. Agri-Agent rabto kando.\nEnd dabayo.",
    cancelled: "Booking cancel. End dabayo.", invalid: "Ghalat input. Wari koshish karyo.",
  },
};
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));
const shortDate = (iso) => { try { return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch (e) { return iso; } };

function UssdSimulator({ t, listings, createBooking, updateBooking }) {
  const [phase, setPhase] = useState("idle");
  const [input, setInput] = useState("");
  const [data, setData] = useState({});
  const [flash, setFlash] = useState("");
  const timer = useRef(null);
  const phoneRef = useRef(null);
  const L = U[data.lang || "ur"];

  useEffect(() => () => clearTimeout(timer.current), []);

  const options = useMemo(() => {
    if (!data.category) return [];
    return listings.filter((l) => l.available && l.category === data.category)
      .sort((a, b) => ((b.district === data.district) - (a.district === data.district)) || a.distance - b.distance).slice(0, 3);
  }, [listings, data.category, data.district]);

  const selected = data.listingId ? listings.find((l) => l.id === data.listingId) : null;
  const q = selected ? quote(selected, data.hours || 1, data.operator, data.transport) : null;

  const reset = () => { clearTimeout(timer.current); setPhase("idle"); setInput(""); setData({}); setFlash(""); };
  const go = (p, patch) => { if (patch) setData((d) => ({ ...d, ...patch })); setPhase(p); setInput(""); setFlash(""); };
  const bad = () => { setFlash(L.invalid); setInput(""); };

  const afterOption = (l, patch) => {
    if (l.operator === "optional") go("operator", patch);
    else if (l.transport === "optional") go("transport", { ...patch, operator: false });
    else go("review", { ...patch, operator: false, transport: false });
  };

  const submit = () => {
    const v = input.trim();
    switch (phase) {
      case "idle": go("lang"); break;
      case "lang": if (v === "1") go("type", { lang: "pa" }); else if (v === "2") go("type", { lang: "ur" }); else if (v === "3") go("type", { lang: "sd" }); else bad(); break;
      case "type": if (["1", "2", "3"].includes(v)) go("date", { category: CATEGORIES[Number(v) - 1] }); else bad(); break;
      case "date": if (["1", "2", "3"].includes(v)) go("hours", { date: addDaysISO([1, 2, 3][Number(v) - 1]) }); else bad(); break;
      case "hours": { const h = parseInt(v, 10); if (h >= 1 && h <= 16) go("loc", { hours: h }); else bad(); break; }
      case "loc": { const i = parseInt(v, 10); if (i >= 1 && i <= 6) go("options", { district: DISTRICTS[i - 1] }); else bad(); break; }
      case "options": {
        if (v === "0") { go("type"); break; }
        const i = parseInt(v, 10);
        if (i >= 1 && i <= options.length) { const l = options[i - 1]; afterOption(l, { listingId: l.id }); } else bad();
        break;
      }
      case "operator": {
        if (v !== "1" && v !== "2") { bad(); break; }
        const op = v === "1";
        if (selected && selected.transport === "optional") go("transport", { operator: op }); else go("review", { operator: op, transport: false });
        break;
      }
      case "transport": if (v === "1" || v === "2") go("review", { transport: v === "1" }); else bad(); break;
      case "review": {
        if (v === "2") { go("cancelledP"); break; }
        if (v !== "1" || !selected) { bad(); break; }
        const id = createBooking(selected, {
          date: data.date, hours: q.hours, operator: selected.operator === "included" || !!data.operator, transport: selected.transport === "included" || !!data.transport,
          payment: "agent", renterName: "USSD Farmer (via Agri-Agent)", renterPhone: "", quote: q, channel: "ussd",
        }, true);
        go("pending", { bookingId: id });
        timer.current = setTimeout(() => { updateBooking(id, "confirmed", null, true); setPhase("confirmed"); }, 1800);
        break;
      }
      case "confirmed": if (v === "1") go("complete"); else bad(); break;
      case "complete":
        if (v === "1") { updateBooking(data.bookingId, "completed", null, true); go("rating"); }
        else if (v === "2") go("issue");
        else bad();
        break;
      case "rating": { const r = parseInt(v, 10); if (r >= 1 && r <= 5) { updateBooking(data.bookingId, "feedback", { rating: r, comment: "Submitted via USSD" }, true); go("done"); } else bad(); break; }
      default: break;
    }
  };

  const press = (k) => {
    setFlash("");
    if (phase === "idle" || phase === "pending") return;
    setInput((s) => (s.length >= 3 ? s : s + k));
  };

  const onKeyDown = (e) => {
    if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === "Enter") { e.preventDefault(); submit(); }
    else if (e.key === "Backspace") { e.preventDefault(); setInput((s) => s.slice(0, -1)); }
    else if (e.key === "Escape") { e.preventDefault(); reset(); }
  };

  const screen = (() => {
    const d1 = shortDate(addDaysISO(1)), d2 = shortDate(addDaysISO(2)), d3 = shortDate(addDaysISO(3));
    switch (phase) {
      case "idle": return "Agri-Share\nDial *AGRI#\n\nPress green button to start";
      case "lang": return "Agri-Share\nZaban chunein / Boli chuno:\n1. Punjabi\n2. Urdu\n3. Sindhi (planned)";
      case "type": return L.type;
      case "date": return fill(L.date, { d1, d2, d3 });
      case "hours": return L.hours;
      case "loc": return L.loc;
      case "options": return options.length ? L.options + "\n" + options.map((l, i) => `${i + 1}. ${l.ownerId} ${l.name.replace(/ (Tractor|Thresher|Harvester)$/, "")}\n   Rs${l.rate}/hr, ${l.distance}km`).join("\n") + "\n0. Wapis" : L.none;
      case "operator": return L.operator;
      case "transport": return fill(L.transport, { fee: selected ? transportFee(selected.distance) : TRANSPORT_MIN });
      case "review": return q ? fill(L.review, { total: q.total.toLocaleString("en-PK"), base: q.base.toLocaleString("en-PK"), op: q.operator, tr: q.transport, comm: q.commission.toLocaleString("en-PK") }) : "";
      case "pending": return fill(L.pending, { owner: selected ? selected.ownerId : "" });
      case "confirmed": return fill(L.confirmed, { id: data.bookingId, machine: selected ? selected.name : "", date: shortDate(data.date), h: data.hours, total: q ? q.total.toLocaleString("en-PK") : "" });
      case "complete": return L.complete;
      case "rating": return L.rating;
      case "done": return L.done;
      case "issue": return L.issue;
      case "cancelledP": return L.cancelled;
      default: return "";
    }
  })();

  const step = PHASE_STEP[phase] || (phase === "issue" ? 7 : phase === "cancelledP" ? 5 : 0);
  const acceptsInput = !["idle", "pending", "done", "issue", "cancelledP"].includes(phase);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]" dir="ltr">
      <div ref={phoneRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="USSD phone simulator. Type digits, Enter to send, Escape to end."
        className="mx-auto w-full max-w-[320px] rounded-[2.2rem] bg-[#1f1a17] p-3 shadow-2xl ring-1 ring-black/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-gold">
        <div className="mx-auto mb-2 h-1.5 w-16 rounded-full bg-black/60" />
        <div className="rounded-2xl bg-[#c9d8b6] p-3 font-mono text-[13px] leading-snug text-[#1b2a12] shadow-inner">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold text-[#1b2a12]/70">
            <span className="flex items-center gap-1"><Signal className="h-3 w-3" aria-hidden="true" />Agri-Net</span>
            <span>USSD</span>
            <Battery className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div className="h-[220px] overflow-y-auto whitespace-pre-wrap rounded-md border border-[#1b2a12]/20 bg-[#d6e3c5] p-2" aria-live="polite">
            {screen}
            {phase === "pending" && <span className="ms-1 inline-block animate-pulse">●</span>}
          </div>
          <div className="mt-2 flex h-8 items-center rounded-md border border-[#1b2a12]/25 bg-[#e6eedb] px-2">
            <span className="flex-1 truncate">{flash ? <span className="text-[11px] font-bold text-red-800">{flash}</span> : acceptsInput ? <>{input}<span className="animate-pulse">▌</span></> : <span className="text-[#1b2a12]/40">·</span>}</span>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={submit} disabled={phase === "pending"} className="flex items-center justify-center rounded-xl bg-emerald-600 py-2.5 text-white hover:bg-emerald-500 disabled:opacity-40" aria-label="Send / call">
            <PhoneCall className="h-5 w-5" />
          </button>
          <button onClick={() => setInput((s) => s.slice(0, -1))} className="flex items-center justify-center rounded-xl bg-[#3a332e] py-2.5 text-ivory hover:bg-[#4a423c]" aria-label="Delete digit">
            <Delete className="h-5 w-5" />
          </button>
          <button onClick={reset} className="flex items-center justify-center rounded-xl bg-red-700 py-2.5 text-white hover:bg-red-600" aria-label="End session">
            <PhoneOff className="h-5 w-5" />
          </button>
          {keys.map((k) => (
            <button key={k} onClick={() => press(k)} className="rounded-xl bg-[#3a332e] py-3 font-mono text-lg font-bold text-ivory hover:bg-[#4a423c] active:scale-95" aria-label={`Key ${k}`}>{k}</button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] font-semibold text-gold">{t("ussd_demo")}</p>
      </div>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-display text-lg font-extrabold text-forest">{t("ussd_steps")}</h3>
          <span className="rounded-full bg-gold/20 px-2.5 py-1 text-xs font-bold text-soil">{t("ussd_demo")}</span>
        </div>
        <ol className="space-y-2">
          {USSD_STEPS.map((s, i) => {
            const n = i + 1, done = step > n || (step === 7 && ["done", "issue"].includes(phase)), active = step === n && !done;
            return (
              <li key={i} className={`flex items-center gap-3 rounded-xl p-3 ring-1 transition ${active ? "bg-forest text-ivory ring-forest" : done ? "bg-leaf/10 text-forest ring-leaf/30" : "bg-white text-soil ring-soil/10"}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${active ? "bg-gold text-soil" : done ? "bg-leafink text-white" : "bg-ivory text-soil/80"}`}>
                  {done ? <Check className="h-4 w-4" aria-hidden="true" /> : n}
                </span>
                <span className="text-sm font-semibold">{s}</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 flex items-start gap-2 text-xs text-soil/80"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("ussd_hint")} Bookings made here appear live in My Bookings and the Owner Portal.</p>
        <button onClick={() => { reset(); setTimeout(() => phoneRef.current && phoneRef.current.focus(), 0); }} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-soil/20 bg-white px-3 py-2 text-sm font-bold text-soil hover:bg-ivory">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Restart
        </button>
      </div>
    </div>
  );
}

function AgentTab({ t, listings, createBooking, updateBooking, setTab }) {
  const cards = [
    { icon: Store, title: t("ag1_t"), text: t("ag1_d") },
    { icon: ClipboardList, title: t("ag2_t"), text: t("ag2_d") },
    { icon: HandCoins, title: t("ag3_t"), text: t("ag3_d") },
    { icon: ShieldCheck, title: t("ag4_t"), text: t("ag4_d") },
  ];
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="ag-h">
      <div className="mb-6 overflow-hidden rounded-3xl bg-soil text-ivory">
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-ivory/10 px-3 py-1 text-xs font-semibold"><Users className="h-3.5 w-3.5 text-gold" aria-hidden="true" />Agri-Agent</p>
            <h2 id="ag-h" className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">{t("ag_title")}</h2>
            <p className="mt-2 max-w-2xl text-ivory/80">{t("ag_sub")}</p>
          </div>
          <div className="flex items-center gap-3 self-center rounded-2xl bg-ivory/10 p-4 ring-1 ring-ivory/15">
            <Megaphone className="h-8 w-8 text-gold" aria-hidden="true" />
            <p className="max-w-[220px] text-sm text-ivory/85">Punjabi · Urdu in pilot. Sindhi planned for expansion.</p>
          </div>
        </div>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-forest text-gold"><Icon className="h-5 w-5" aria-hidden="true" /></span>
            <h3 className="mt-3 font-bold text-forest">{title}</h3>
            <p className="mt-1 text-sm text-soil/80">{text}</p>
          </div>
        ))}
      </div>
      <div className="rounded-3xl border border-soil/10 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="mb-5 flex items-center gap-2 font-display text-xl font-extrabold text-forest"><Smartphone className="h-5 w-5" aria-hidden="true" />{t("ussd_title")}</h3>
        <UssdSimulator t={t} listings={listings} createBooking={createBooking} updateBooking={updateBooking} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Kisan Helper: Claude (sample capability / window.claude.complete)   */
/* with an always-available rule-based fallback                        */
/* ------------------------------------------------------------------ */
const HRS_PER_ACRE = { tractor: 1.0, thresher: 1.5, harvester: 0.8 }; // rough rules of thumb
const DIESEL_L_PER_HR = { tractor: 4, thresher: 3, harvester: 10, leveler: 4, planter: 3, drone: 0, implement: 4 };

function detectReplyLang(text) {
  if (/[؀-ۿ]/.test(text)) return "ur";
  if (/\b(kya|kia|hai|hain|mujhe|mjhe|chahiye|chaiye|kitna|kitne|kitni|kaise|kese|kiraya|kiraye|ghante|ghanta|zameen|gandum|makai|batao|bataen|bataein|karna|lena|wala|aur|nahi|acha|kahan)\b/i.test(text)) return "ro";
  return "en";
}
const normDigits = (s) => s.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

const HELPER_EXTRA = {"register": {"pa": "ایگری شیئر تے رجسٹر ہون دا طریقہ:\n1. اُتے \"سائن اپ\" دباؤ۔\n2. پورا ناں، ای میل، موبائل تے ضلع لکھو۔\n3. اپنا کردار چنو: کسان، مشینری مالک یا ایگری ایجنٹ۔\n4. پاس ورڈ (گھٹ توں گھٹ 6 حرف) دو واری لکھو تے پرائیویسی نوٹ منو۔\n5. \"اکاؤنٹ بناؤ\" دباؤ۔", "sd": "ايگري شيئر تي رجسٽر ٿيڻ جو طريقو:\n1. مٿي \"سائن اپ\" دٻايو۔\n2. پورو نالو، اي ميل، موبائل ۽ ضلعو لکو۔\n3. پنهنجو ڪردار چونڊيو: هاري، مشينري مالڪ يا ايگري ايجنٽ۔\n4. پاس ورڊ (گهٽ ۾ گهٽ 6 اکر) ٻه ڀيرا لکو ۽ پرائيويسي نوٽ قبول ڪريو۔\n5. \"کاتو ٺاهيو\" دٻايو۔", "ps": "په اګري شېئر کې د نوم لیکنې طریقه:\n1. پورته \"نوم لیکنه\" کېکاږئ.\n2. بشپړ نوم، ای میل، موبایل او ضلع ولیکئ.\n3. خپل رول وټاکئ: بزګر، د ماشین مالک یا اګري اېجنټ.\n4. پاسورډ (لږ تر لږه 6 توري) دوه ځله ولیکئ او د محرمیت یادونه ومنئ.\n5. \"حساب جوړ کړئ\" کېکاږئ.", "bal": "ایگری شیئر ءَ رجسٹر بیگ ءِ راہ:\n1. سرا \"سائن اپ\" ءَ جن۔\n2. پوریں نام، ای میل، موبائل و ضلع نبشتہ کن۔\n3. وتی کار گچین کن: بزگر، مشین ءِ واھند یا ایگری ایجنٹ۔\n4. پاس ورڈ (کمّ ءِ کمّ 6 حرف) دو بر نبشتہ کن و پرائیویسی ءِ نوٹ ءَ بمنّ۔\n5. \"اکاؤنٹ جوڑ کن\" ءَ جن۔"}, "offer": {"pa": "کرایہ ودھ لگدا اے؟ اپنی قیمت دسو:\n1. مشین تے \"بکنگ دی درخواست\" دباؤ۔\n2. \"اپنی قیمت دسو\" چالو کرو۔\n3. فی گھنٹہ پیشکش (لکھے ریٹ دا گھٹ توں گھٹ 60%) تے ٹرانسپورٹ دی پیشکش لکھو۔\n4. سنیہا لکھ کے گھلو۔ مالک منے گا، جوابی پیشکش دیوے گا یا انکار کرے گا۔ ٹرانسپورٹ فاصلے دے حساب نال اے (100 روپے فی کلومیٹر، گھٹ توں گھٹ 500)۔", "sd": "ڪرايو وڌيڪ لڳي ٿو؟ پنهنجي قيمت ٻڌايو:\n1. مشين تي \"بڪنگ جي درخواست\" دٻايو۔\n2. \"پنهنجي قيمت ٻڌايو\" چالو ڪريو۔\n3. في ڪلاڪ آڇ (لکيل اگهه جو گهٽ ۾ گهٽ 60%) ۽ ٽرانسپورٽ جي آڇ لکو۔\n4. پيغام لکي موڪليو۔ مالڪ قبول، جوابي آڇ يا انڪار ڪري سگهي ٿو۔ ٽرانسپورٽ فاصلي موجب آهي (100 رپيا في ڪلوميٽر، گهٽ ۾ گهٽ 500)۔", "ps": "کرایه ډېره ښکاري؟ خپله بیه وړاندې کړئ:\n1. پر ماشین \"د بکنګ غوښتنه\" کېکاږئ.\n2. \"خپله بیه وړاندې کړئ\" چالان کړئ.\n3. فی ساعت وړاندیز (د ثبت شوې بیې لږ تر لږه 60%) او د ټرانسپورټ وړاندیز ولیکئ.\n4. پیغام ولیکئ او ولېږئ. مالک یې منلی، بل وړاندیز ورکولی یا ردولی شي. ټرانسپورټ د واټن له مخې دی (100 روپۍ فی کیلومتر، لږ تر لږه 500).", "bal": "کرایہ گیش اِنت؟ وتی بہا ءَ پیش کن:\n1. مشین ءِ سرا \"بکنگ ءِ درخواست\" ءَ جن۔\n2. \"وتی بہا ءَ پیش کن\" ءَ روشن کن۔\n3. ساعت ءِ پیشکش (نبشتہ کتگیں نرخ ءِ کمّ ءِ کمّ 60%) و ٹرانسپورٹ ءِ پیشکش نبشتہ کن۔\n4. کلہو نبشتہ کن و دیم دئے۔ واھند منّیت، دومی پیشکش دنت یا نہ منّیت۔ ٹرانسپورٹ دوری ءِ ہساب ءَ اِنت (100 کلدار فی کلومیٹر، کمّ ءِ کمّ 500)۔"}, "paylater": {"pa": "ہن وڈھی، بعد وچ ادائیگی: بکنگ فارم وچ ایہہ ادائیگی چنو۔ تسیں ہن صرف 30% دیو؛ باقی 70% تیجی دھر مائیکروفنانس پارٹنر (تجویز: جاز کیش کریڈٹ، ایزی پیسہ یا ZTBL) دا قرض اے جو وڈھی توں بعد (60 توں 180 دن) دینا اے۔ خطرہ پارٹنر دا اے، ایگری شیئر دا نئیں۔ سوکھا طریقہ: ایگری منڈی تے فصل ویچو، 70% آپے کٹ جاوے گا۔", "sd": "هاڻي لابارو، پوءِ ادائيگي: بڪنگ فارم ۾ هي ادائيگي چونڊيو۔ توهان هاڻي صرف 30% ڏيو؛ باقي 70% ٽئين ڌر مائڪروفنانس پارٽنر (تجويز: جاز ڪيش ڪريڊٽ، ايزي پيسا يا ZTBL) جو قرض آهي جيڪو لاباري کان پوءِ (60 کان 180 ڏينهن) ڏيڻو آهي۔ خطرو پارٽنر جو آهي، ايگري شيئر جو ناهي۔ سولو طريقو: ايگري منڊي تي فصل وڪڻو، 70% پاڻمرادو ڪٽجي ويندو۔", "ps": "اوس لو، وروسته تادیه: د بکنګ په فورمه کې دا تادیه وټاکئ. تاسو اوس یوازې 30% ورکوئ؛ پاتې 70% د دریم اړخ مایکروفنانس شریک (وړاندیز: جاز کیش کریډټ، ایزي پیسه یا ZTBL) پور دی چې له لو وروسته (60 تر 180 ورځو) ورکول کېږي. خطر د شریک دی، د اګري شېئر نه. اسانه لاره: په اګري منډۍ کې فصل وپلورئ، 70% به په خپله پرې شي.", "bal": "انّوں رونگ، رند ءَ زرّ: بکنگ ءِ فارم ءَ اے راہ ءَ گچین کن۔ شما انّوں تهنا 30% دئیت؛ پشت کپتگیں 70% سیمی دَپ ءِ مائیکروفنانس ہمراہ (پیشنهاد: جاز کیش کریڈٹ، ایزی پیسہ یا ZTBL) ءِ وام اِنت کہ رونگ ءَ رند (60 تا 180 روچ) دئیگ بیت۔ خطر ہمراہ ءِ اِنت، ایگری شیئر ءِ نہ۔ آسانیں راہ: ایگری منڈی ءَ کِشت ءَ بہا کن، 70% وت ءَ کٹ بیت۔"}, "mandi": {"pa": "ایگری منڈی:\n1. فصل (کنک، چول، مکئی، کپاہ)، مقدار من وچ، معیار تے پنڈ چنو۔\n2. فی من متوقع قیمت تے جاز کیش یا ایزی پیسہ نمبر لکھو۔\n3. پوسٹ کرو: آٹا ملاں، رائس ملاں تے وڈے خریدار لائیو بولی لاندے نیں۔\n4. سب توں چنگی بولی منو: ویچ دی رقم وچوں باقی 70% مشینری قرض کٹ کے خالص منافع تہاڈے والٹ وچ۔", "sd": "ايگري منڊي:\n1. فصل (ڪڻڪ، چانور، مڪئي، ڪپهه)، مقدار مڻن ۾، معيار ۽ ڳوٺ چونڊيو۔\n2. في مڻ متوقع قيمت ۽ جاز ڪيش يا ايزي پيسا نمبر لکو۔\n3. پوسٽ ڪريو: اٽي ۽ چانورن جون ملون ۽ وڏا خريدار لائيو بولي ڏين ٿا۔\n4. بهترين بولي قبول ڪريو: وڪري مان باقي 70% مشينري قرض ڪٽجي خالص منافعو توهان جي والٽ ۾۔", "ps": "اګري منډۍ:\n1. فصل (غنم، وريجې، جوار، پنبه)، مقدار په من، کیفیت او کلی وټاکئ.\n2. فی من تمه‌لرونکې بیه او د جاز کیش یا ایزي پیسه شمېره ولیکئ.\n3. ثبت یې کړئ: د اوړو او وريجو ملونه او لوی پېرودونکي ژوندۍ داوطلبي کوي.\n4. غوره داوطلبي ومنئ: له پلور څخه پاتې 70% د ماشین پور پرې کېږي او خالصه ګټه ستاسو والټ ته ځي.", "bal": "ایگری منڈی:\n1. کِشت (گندم، برنج، جُوار، کپاس)، کچ من ءَ، جوانی و میتگ گچین کن۔\n2. فی من امیتیں بہا و جاز کیش یا ایزی پیسہ ءِ نمبر نبشتہ کن۔\n3. دیم دئے: آرت و برنج ءِ مِل و مزنیں گِروک زندگیں بولی جن اَنت۔\n4. گہتریں بولی ءَ بمنّ: بہا ءَ چہ پشت کپتگیں 70% مشین ءِ وام کٹ بیت و خالصیں کٹّ شمئے والٹ ءَ رَوت۔"}, "keypad": {"pa": "سمارٹ فون نئیں؟ کسے وی سادے فون توں ٹول فری ہیلپ لائن 0800-AGRI-1 تے کال کرو یا *AGRI# ملاؤ (دونویں ڈیمو دے نمونے نمبر، ہلے چالو نئیں)۔ پنجابی یا اردو آواز دسے گی: مشین لئی 1، فصل ویچن لئی 2، ایجنٹ لئی 0۔ بکنگ دی تصدیق SMS تے آوے گی۔", "sd": "سمارٽ فون ناهي؟ ڪنهن به سادي فون مان ٽول فري هيلپ لائن 0800-AGRI-1 تي ڪال ڪريو يا *AGRI# ملايو (ٻئي ڊيمو جا نمونا نمبر، اڃا فعال ناهن)۔ پنجابي يا اردو آواز ٻڌائيندو: مشين لاءِ 1، فصل وڪڻڻ لاءِ 2، ايجنٽ لاءِ 0۔ بڪنگ جي تصديق SMS تي ايندي۔", "ps": "سمارټ فون نه لرئ؟ له هر ساده ټیلیفون څخه وړیا هېلپ لاین 0800-AGRI-1 ته زنګ ووهئ یا *AGRI# ډایل کړئ (دواړه د ډیمو نمونه شمېرې دي، لا فعالې نه دي). پنجابي یا اردو غږ لارښوونه کوي: د ماشین لپاره 1، د فصل پلور لپاره 2، اېجنټ لپاره 0. بکنګ مو په SMS تاییدېږي.", "bal": "سمارٹ فون نیست؟ ہر سادگیں فون ءَ چہ مُفتیں ہیلپ لائن 0800-AGRI-1 ءَ کال کن یا *AGRI# ءَ جن (دوئیں ڈیمو ءِ نمونہیں نمبر اَنت، انّوں کار نہ کن اَنت)۔ پنجابی یا اردو توار راہشونی کنت: مشین ءِ واستا 1، کِشت ءِ بہا ءِ واستا 2، ایجنٹ ءِ واستا 0۔ بکنگ ءِ منّگ SMS ءَ کئیت۔"}, "menu": {"pa": "میں ایہناں وچ مدد کر سکدا آں:\n• ویب سائٹ: سائن اپ، سائن ان، بکنگ، قیمت دی پیشکش، مشین لکھانا\n• ہن وڈھی، بعد وچ ادائیگی (30% / 70%)\n• ایگری منڈی تے فصل ویچنا\n• ڈیزل، آپریٹر، ٹرانسپورٹ تے کمیشن (6%)", "sd": "مان انهن ۾ مدد ڪري سگهان ٿو:\n• ويب سائيٽ: سائن اپ، سائن ان، بڪنگ، قيمت جي آڇ، مشين لکرائڻ\n• هاڻي لابارو، پوءِ ادائيگي (30% / 70%)\n• ايگري منڊي تي فصل وڪڻڻ\n• ڊيزل، آپريٽر، ٽرانسپورٽ ۽ ڪميشن (6%)", "ps": "زه په دې کې مرسته کولی شم:\n• ویب پاڼه: نوم لیکنه، ننوتل، بکنګ، د بیې وړاندیز، د ماشین ثبتول\n• اوس لو، وروسته تادیه (30% / 70%)\n• په اګري منډۍ کې د فصل پلورل\n• ډیزل، چلوونکی، ټرانسپورټ او کمیشن (6%)", "bal": "من اے کاراں کمک کت کناں:\n• ویب سائٹ: سائن اپ، سائن ان، بکنگ، بہا ءِ پیشکش، مشین ءِ نبشتہ کنگ\n• انّوں رونگ، رند ءَ زرّ (30% / 70%)\n• ایگری منڈی ءَ کِشت ءِ بہا کنگ\n• ڈیزل، چلائوک، ٹرانسپورٹ و کمیشن (6%)"}};
const HELPER_CHIPS = {"en": ["How do I register?", "The rate is too high. Can I offer less?", "How does Pay After Harvest work?", "How do I sell my wheat?", "I only have a basic phone"], "ur": ["رجسٹر کیسے ہوں؟", "کرایہ مہنگا ہے، کم کیسے کروں؟", "30% ابھی، 70% بعد میں کیسے؟", "اپنی گندم کیسے بیچوں؟", "سادہ فون سے بکنگ؟ ہیلپ لائن"], "pa": ["رجسٹر کیویں ہوواں؟", "کرایہ مہنگا اے، قیمت گھٹ کیویں کراں؟", "30% ہن، 70% بعد وچ کیویں؟", "اپنی کنک منڈی وچ کیویں ویچاں؟", "سادے فون نال بکنگ؟ ہیلپ لائن"], "sd": ["رجسٽر ڪيئن ٿيان؟", "ڪرايو مهانگو آهي، قيمت گهٽ ڪيئن ڪريان؟", "30% هاڻي، 70% پوءِ ڪيئن؟", "پنهنجي ڪڻڪ منڊي ۾ ڪيئن وڪڻان؟", "سادي فون سان بڪنگ؟ هيلپ لائن"], "ps": ["څنګه نوم لیکنه وکړم؟", "کرایه ګرانه ده، بیه څنګه کمه کړم؟", "30% اوس، 70% وروسته څنګه؟", "خپل غنم په منډۍ کې څنګه وپلورم؟", "ساده ټیلیفون لرم، هېلپ لاین؟"], "bal": ["چون رجسٹر باں؟", "کرایہ گران اِنت، بہا ءَ چون کم کناں؟", "30% انّوں، 70% رند ءَ چون؟", "وتی گندم ءَ منڈی ءَ چون بہا کناں؟", "سادگیں فون ہست، ہیلپ لائن؟"]};
// Reply language: follows the selected app language; in English mode it follows what the farmer typed
function pickReplyLang(raw, uiLang) {
  const typed = detectReplyLang(raw); // en | ur | ro
  if (!uiLang || uiLang === "en") return typed;
  if (uiLang === "ur" && typed === "ro") return "ro";
  return uiLang;
}

function ruleAnswer(raw, listings, dieselPrice = DIESEL_BENCHMARK, uiLang = "en", forceLang) {
  const text = normDigits(raw);
  const lang = forceLang || pickReplyLang(raw, uiLang);
  const L = (o) => o[lang] || (["pa", "sd", "ps", "bal"].includes(lang) ? o.ur : null) || o.en;
  const LX = (intent, o) => (HELPER_EXTRA[intent] && HELPER_EXTRA[intent][lang]) || L(o);
  const avail = listings.filter((l) => l.available);
  const avgRate = (c) => {
    const xs = avail.filter((l) => l.category === c);
    const src = xs.length ? xs : listings.filter((l) => l.category === c);
    return src.length ? Math.round(src.reduce((s, l) => s + l.rate, 0) / src.length / 50) * 50 : { tractor: 2400, thresher: 1900, harvester: 8750 }[c];
  };
  const name = (c) => L({ en: { tractor: "tractor", thresher: "thresher", harvester: "combine harvester" }[c], ur: { tractor: "ٹریکٹر", thresher: "تھریشر", harvester: "کمبائن ہارویسٹر" }[c], ro: { tractor: "tractor", thresher: "thresher", harvester: "combine harvester" }[c] });
  const money = (n) => "Rs " + Math.round(n).toLocaleString("en-PK");

  let machine = null;
  if (/harvest|harvestor|combine|ہارویسٹر|ہاروسٹر|ہارویسٹرز|کمبائن|کٹائی|katai|kataai|wadhi|वाढी|हार्वेस्टर/i.test(text)) machine = "harvester";
  else if (/thresh|thrash|tharesh|تھریشر|تھریسر|تھریشر|گہائی|gahai|sheller|थ्रेशर/i.test(text)) machine = "thresher";
  else if (/tractor|tractar|traktar|tracter|ٹریکٹر|ٹریکٹرز|ٹیکٹر|plough|plow|rotavator|cultivat|hal chala|ہل|زمین تیار|bijai|بیجائی|sowing|ट्रैक्टर/i.test(text)) machine = "tractor";

  const acreM = text.match(/(\d+(?:\.\d+)?)\s*(acres?|ekar|ekr|eker|ایکڑ|ایکر|killa|killay|kille|qila|کلے|کلہ)/i);
  const kanalM = text.match(/(\d+(?:\.\d+)?)\s*(kanal|کنال)/i);
  const hourM = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|ghante|ghanta|ghantay|گھنٹے|گھنٹہ)/i);
  const acres = acreM ? parseFloat(acreM[1]) : kanalM ? parseFloat(kanalM[1]) / 8 : null;
  const hoursAsked = hourM ? parseFloat(hourM[1]) : null;
  const wheat = /wheat|gandum|گندم/i.test(text), maize = /maize|corn|makai|مکئی/i.test(text), rice = /rice|paddy|dhan|chawal|دھان|چاول/i.test(text);

  const costLines = (c, hrs) => {
    const rate = avgRate(c);
    const base = rate * hrs, comm = Math.round(base * COMMISSION), total = base + comm, litres = Math.round(DIESEL_L_PER_HR[c] * hrs);
    return L({
      en: `• ${name(c)}: about ${hrs} h × ${money(rate)}/hr = ${money(base)}\n• + 6% platform commission ${money(comm)} → total about ${money(total)}\n• Dry rent: diesel is extra, roughly ${litres} litres (rule of thumb)\n• Operator, if optional, adds Rs 500/hr; transport, if optional, adds Rs 1,500`,
      ur: `• ${name(c)}: تقریباً ${hrs} گھنٹے × ${money(rate)} فی گھنٹہ = ${money(base)}\n• + 6% پلیٹ فارم کمیشن ${money(comm)} → کل تقریباً ${money(total)}\n• ڈرائی رینٹ: ڈیزل الگ ہے، اندازاً ${litres} لیٹر\n• اختیاری آپریٹر 500 روپے فی گھنٹہ، اختیاری ٹرانسپورٹ 1,500 روپے`,
      ro: `• ${name(c)}: taqreeban ${hrs} ghante × ${money(rate)}/ghanta = ${money(base)}\n• + 6% platform commission ${money(comm)} → kul taqreeban ${money(total)}\n• Dry rent: diesel alag hai, andazan ${litres} litre\n• Optional operator Rs 500/ghanta, optional transport Rs 1,500`,
    });
  };

  const disclaimer = L({ en: "\n\nThese are estimates. Confirm hours and terms with the owner before booking.", ur: "\n\nیہ صرف اندازے ہیں۔ بکنگ سے پہلے مالک سے گھنٹے اور شرائط طے کریں۔", ro: "\n\nYe sirf andaze hain. Booking se pehle maalik se ghante aur shartein tay karein." });

  if (acres) {
    const cats = machine ? [machine] : wheat || rice ? ["harvester", "thresher"] : maize ? ["thresher"] : ["tractor", "thresher", "harvester"];
    const parts = cats.map((c) => {
      const hrs = Math.max(1, Math.ceil(acres * HRS_PER_ACRE[c] * 2) / 2);
      return costLines(c, hrs);
    });
    const head = L({ en: `For ${acres} acre${acres === 1 ? "" : "s"}:`, ur: `${acres} ایکڑ کے لیے:`, ro: `${acres} acre ke liye:` });
    return head + "\n" + parts.join("\n\n") + disclaimer;
  }
  if (hoursAsked && machine) {
    return L({ en: `For ${hoursAsked} hours:`, ur: `${hoursAsked} گھنٹوں کے لیے:`, ro: `${hoursAsked} ghanton ke liye:` }) + "\n" + costLines(machine, hoursAsked) + disclaimer;
  }

  // ---------- Website / portal guidance ----------
  const has = (re) => re.test(text);
  const steps = (o) => L(o) + "";
  if (has(/pay later|baad me|baad mein|bad mein|30 ?%|70 ?%|advance|udhaar|udhar|qarz|loan|credit|ztbl|ادھار|قرض|بعد میں|پیشگی|pay after|after harvest|پور|قرض|اڌار|زرّ/i)) {
    return LX("paylater", {
      en: "Harvest Now, Pay Later: in the booking form choose that payment option. You pay only 30% now; the other 70% is lent by a third-party microfinance partner (proposed: JazzCash Credit, EasyPaisa or ZTBL) and is due after harvest (60 to 180 days). The partner carries the repayment risk, not Agri-Share. Easiest repayment: sell your crop on Agri-Market and the 70% is deducted automatically before your profit is paid out.",
      ur: "ابھی کٹائی، بعد میں ادائیگی: بکنگ فارم میں یہ ادائیگی چنیں۔ آپ ابھی صرف 30% دیں؛ باقی 70% تیسرے فریق مائیکروفنانس پارٹنر (مجوزہ: جاز کیش کریڈٹ، ایزی پیسہ یا زرعی ترقیاتی بینک) کا قرض ہے جو کٹائی کے بعد (60 سے 180 دن) واجب ہے۔ خطرہ پارٹنر کا ہے، ایگری شیئر کا نہیں۔ آسان طریقہ: ایگری منڈی پر فصل بیچیں، 70% خود کٹ جائے گا اور منافع آپ کو ملے گا۔",
      ro: "Harvest Now, Pay Later: booking form mein ye payment chunein. Aap abhi sirf 30% dein; baqi 70% third-party microfinance partner (proposed: JazzCash Credit, EasyPaisa ya ZTBL) ka qarz hai jo katai ke baad (60 se 180 din) dena hai. Risk partner ka hai, Agri-Share ka nahi. Asaan tareeqa: Agri-Mandi par fasal bechein, 70% khud kat jayega aur munafa aap ko milega.",
    });
  }
  if (has(/mandi|sell (my )?(crop|harvest|wheat|rice|maize|cotton)|fasal bech|bechni|bechna|bechun|flour mill|rice mill|buyer|khareedar|منڈی|فصل بیچ|گندم بیچ|خریدار|منډۍ|منڊي|وپلورم|وڪڻان|بہا کناں|بیچوں|بیچنی|بیچنا|ویچاں|ویچنی|ویچنا|sell/i)) {
    return LX("mandi", {
      en: "Agri-Market (Sell Harvest tab):\n1. Choose crop (wheat, rice, maize, cotton), quantity in maunds, quality and village.\n2. Enter your expected rate per mann and your JazzCash or EasyPaisa number.\n3. Post: flour mills, rice mills and bulk buyers bid live (some above your rate, some counter lower).\n4. Accept the best bid and check the settlement: sale value minus any pending 70% machinery credit = net profit to your wallet (Closed-Loop Settlement).",
      ur: "ایگری منڈی (فصل بیچیں ٹیب):\n1. فصل (گندم، چاول، مکئی، کپاس)، مقدار من میں، معیار اور گاؤں چنیں۔\n2. فی من متوقع قیمت اور جاز کیش یا ایزی پیسہ نمبر لکھیں۔\n3. پوسٹ کریں: آٹا ملز، رائس ملز اور بڑے خریدار لائیو بولی لگاتے ہیں۔\n4. بہترین بولی قبول کریں: فروخت کی رقم سے باقی 70% مشینری قرض کٹ کر خالص منافع آپ کے والٹ میں (کلوزڈ لوپ ادائیگی)۔",
      ro: "Agri-Mandi (Sell Harvest tab):\n1. Fasal (gandum, chawal, makai, kapas), miqdar mann mein, quality aur gaon chunein.\n2. Fi mann expected rate aur JazzCash ya EasyPaisa number likhein.\n3. Post karein: flour mills, rice mills aur bulk buyers live boli lagate hain.\n4. Best boli accept karein: sale ki raqam se baqi 70% machinery qarz kat kar net munafa aap ke wallet mein (Closed-Loop Settlement).",
    });
  }
  if (has(/keypad|button phone|simple phone|sada phone|helpline|help line|0800|toll|ivr|call kar|ہیلپ لائن|سادہ فون|کال|basic phone|هيلپ لائن|هېلپ لاین|ساده ټیلیفون|سادي فون|سادگیں فون/i)) {
    return LX("keypad", {
      en: "No smartphone? Call the toll-free helpline 0800-AGRI-1 or dial *AGRI# from any basic phone. A Punjabi or Urdu voice guides you: press 1 to rent a machine, 2 to sell your crop, 0 to talk to an agent. Your booking is confirmed by SMS. A village Agri-Agent can also book for you.",
      ur: "اسمارٹ فون نہیں؟ کسی بھی سادہ فون سے ٹول فری ہیلپ لائن 0800-AGRI-1 پر کال کریں یا *AGRI# ملائیں (دونوں ڈیمو کے نمونہ نمبر ہیں، ابھی فعال نہیں)۔ پنجابی یا اردو آواز رہنمائی کرے گی: مشین کے لیے 1، فصل بیچنے کے لیے 2، ایجنٹ کے لیے 0۔ بکنگ کی تصدیق SMS پر آئے گی۔",
      ro: "Smartphone nahi? Kisi bhi saade phone se toll-free helpline 0800-AGRI-1 par call karein ya *AGRI# dial karein. Punjabi ya Urdu awaaz rehnumai karegi: machine ke liye 1, fasal bechne ke liye 2, agent ke liye 0. Booking ki tasdeeq SMS par aayegi.",
    });
  }
  if (has(/apni boli|\bboli\b|name your price|اپنی بولی|بولی|پنهنجي ٻولي|post (a )?request|live request|apni qeemat|wet rent|\bwet\b|radius|tier|100 ?km|door se|دور سے|ویٹ رینٹ|درخواست پوسٹ/i)) {
    return steps({
      en: `Apni Boli, Name Your Price (Post a Request tab):\n1. Choose machine, village, hours and date.\n2. Enter the rate you want to pay per hour.\n3. Pick Dry rent (you buy diesel) or Wet rent (owner adds diesel at market rate, about Rs ${dieselPrice}/L).\n4. Post: nearby owners appear on the live radar and accept or counter (often +Rs 200/hr).\n5. If nobody is free, expand: Tier 1 village 1 to 5 km (transport 0 to 500), Tier 2 pilot zone 15 to 25 km (Rs 60/km each way), Tier 3 regional backup up to 100 km.\n6. Accept an offer, check the cost breakdown (rent, transport, diesel, 6% commission, grand total) and confirm.`,
      ur: `اپنی بولی (درخواست پوسٹ کریں ٹیب):\n1. مشین، گاؤں، گھنٹے اور تاریخ چنیں۔\n2. فی گھنٹہ اپنی پیشکش لکھیں۔\n3. ڈرائی رینٹ (ڈیزل آپ کا) یا ویٹ رینٹ (ڈیزل مالک کا، تقریباً ${dieselPrice} روپے فی لیٹر، تخمینی) چنیں۔\n4. پوسٹ کریں: قریبی مالکان ریڈار پر آ کر قبول یا جوابی پیشکش (اکثر +200 روپے) دیتے ہیں۔\n5. کوئی فارغ نہ ہو تو دائرہ بڑھائیں: درجہ 1 گاؤں 1 سے 5 کلومیٹر، درجہ 2 پائلٹ علاقہ 15 سے 25 کلومیٹر (60 روپے فی کلومیٹر ہر طرف)، درجہ 3 بیک اپ 100 کلومیٹر تک۔\n6. پیشکش قبول کریں، مکمل خرچ دیکھیں اور کنفرم کریں۔`,
      ro: `Apni Boli (Post a Request tab):\n1. Machine, gaon, ghante aur date chunein.\n2. Ghante ka apna rate likhein.\n3. Dry rent (diesel aap ka) ya Wet rent (diesel maalik ka, taqreeban Rs ${dieselPrice}/L, andaza) chunein.\n4. Post karein: qareebi maalik radar par aa kar accept ya counter (aksar +Rs 200) dete hain.\n5. Koi free na ho to expand karein: Tier 1 gaon 1 se 5 km, Tier 2 pilot zone 15 se 25 km (Rs 60/km har taraf), Tier 3 backup 100 km tak.\n6. Offer accept karein, poora kharcha dekhein aur confirm karein.`,
    });
  }
  if (has(/forgot|reset|password bhool|bhool gay|پاس ?ورڈ|password/i)) {
    return steps({
      en: "Forgot your password?\n1. Click Sign in (top right).\n2. Tap \"Forgot password?\".\n3. Enter your registered email and a new password twice.\n4. Press \"Set new password\", then sign in again.",
      ur: "پاس ورڈ بھول گئے؟\n1. اوپر سائن ان دبائیں۔\n2. \"پاس ورڈ بھول گئے؟\" پر کلک کریں۔\n3. رجسٹرڈ ای میل اور نیا پاس ورڈ دو بار لکھیں۔\n4. \"نیا پاس ورڈ رکھیں\" دبائیں، پھر سائن ان کریں۔",
      ro: "Password bhool gaye?\n1. Upar Sign in dabayein.\n2. \"Forgot password?\" par click karein.\n3. Registered email aur naya password do baar likhein.\n4. \"Set new password\" dabayein, phir sign in karein.",
    });
  }
  if (has(/register|sign ?up|signup|account (bana|ban|create|kaise|kese)|create (an )?account|naya account|اکاؤنٹ|رجسٹر|سائن اپ|join|رجسٽر|رجسټر|نوم لیکنه|ثبت نام|رجسٹر باں/i)) {
    return LX("register", {
      en: "To register on Agri-Share:\n1. Click \"Sign up\" at the top right (or try to book a machine, it will ask you).\n2. Enter your full name, email, mobile (03XXXXXXXXX) and district.\n3. Choose your role: Farmer/Renter, Machinery Owner or Agri-Agent.\n4. Set a password (6+ characters), confirm it and accept the privacy note.\n5. Press \"Create account\". You are signed in straight away.",
      ur: "ایگری شیئر پر رجسٹر ہونے کا طریقہ:\n1. اوپر دائیں \"سائن اپ\" دبائیں (یا مشین بک کریں، یہ خود پوچھے گا)۔\n2. پورا نام، ای میل، موبائل (03XXXXXXXXX) اور ضلع لکھیں۔\n3. اپنا کردار چنیں: کسان، مشینری مالک یا ایگری ایجنٹ۔\n4. پاس ورڈ (کم از کم 6 حروف) رکھیں، دوبارہ لکھیں اور پرائیویسی نوٹ قبول کریں۔\n5. \"اکاؤنٹ بنائیں\" دبائیں، آپ فوراً سائن ان ہو جائیں گے۔",
      ro: "Agri-Share par register hone ka tareeqa:\n1. Upar \"Sign up\" dabayein (ya machine book karein, ye khud poochega).\n2. Poora naam, email, mobile (03XXXXXXXXX) aur district likhein.\n3. Apna role chunein: Kisan/Renter, Machinery Owner ya Agri-Agent.\n4. Password (kam az kam 6 huroof) rakhein, dobara likhein aur privacy note accept karein.\n5. \"Create account\" dabayein, aap foran sign in ho jayenge.",
    });
  }
  if (has(/sign ?in|log ?in|login|لاگ ان|سائن ان/i)) {
    return steps({
      en: "To sign in: click \"Sign in\" at the top right, enter the email and password you registered with, and press Sign in. Your name appears in the top corner once you are in. To leave, open that menu and choose Sign out.",
      ur: "سائن ان کے لیے: اوپر \"سائن ان\" دبائیں، رجسٹرڈ ای میل اور پاس ورڈ لکھیں اور سائن ان دبائیں۔ کامیاب ہونے پر آپ کا نام اوپر نظر آئے گا۔ باہر نکلنے کے لیے اسی مینو سے سائن آؤٹ چنیں۔",
      ro: "Sign in ke liye: upar \"Sign in\" dabayein, registered email aur password likhein aur Sign in dabayein. Kamyab hone par aap ka naam upar nazar aayega. Bahar nikalne ke liye usi menu se Sign out chunein.",
    });
  }
  if (has(/offer|negotiat|bargain|discount|cheap|expensive|too high|reduce|kam kar|kam kaise|zyada hai|ziada hai|zada hai|kum kar|mehnga|mehenga|mehanga|sasta|رعایت|مہنگا|سستا|کم کر|پیشکش|قیمت|گران اِنت|ګرانه|مهانگو|قيمت|بیه|کمه کړم|گهٽ ڪيئن/i)) {
    return LX("offer", {
      en: "Think a rate is too high? You can suggest your own price:\n1. Press \"Request Booking\" on a machine.\n2. Turn on \"Suggest your own price\".\n3. Enter your hourly offer (at least 60% of the listed rate) and, if you add transport, your transport offer.\n4. Add a note, e.g. \"I live 2 km away\", and send.\nThe owner can accept, send a counter-offer or decline. You will see it in My Bookings. Transport is already distance based (PKR 100/km, min 500), so nearby farmers pay less.",
      ur: "کرایہ زیادہ لگتا ہے؟ آپ اپنی قیمت تجویز کر سکتے ہیں:\n1. مشین پر \"بکنگ کی درخواست\" دبائیں۔\n2. \"اپنی قیمت تجویز کریں\" آن کریں۔\n3. فی گھنٹہ پیشکش (کم از کم درج ریٹ کا 60%) اور ٹرانسپورٹ کی پیشکش لکھیں۔\n4. پیغام لکھیں، مثلاً \"میں 2 کلومیٹر دور ہوں\"، اور بھیج دیں۔\nمالک قبول، جوابی پیشکش یا انکار کر سکتا ہے، جو میری بکنگز میں نظر آئے گا۔ ٹرانسپورٹ پہلے ہی فاصلے کے حساب سے ہے (100 روپے فی کلومیٹر، کم از کم 500)۔",
      ro: "Kiraya zyada lagta hai? Aap apni qeemat suggest kar sakte hain:\n1. Machine par \"Request Booking\" dabayein.\n2. \"Suggest your own price\" on karein.\n3. Ghante ki offer (kam az kam listed rate ka 60%) aur transport ki offer likhein.\n4. Note likhein, jaise \"main 2 km door hoon\", aur bhej dein.\nMaalik accept, counter-offer ya decline kar sakta hai, jo My Bookings mein nazar aayega. Transport pehle hi distance ke hisaab se hai (Rs 100/km, kam az kam 500).",
    });
  }
  if (has(/cancel|منسوخ/i)) {
    return steps({
      en: "To cancel: open My Bookings and press \"Cancel request\" on a booking that is still waiting for the owner. If the owner sent a counter-offer, you can press Decline instead.",
      ur: "منسوخ کرنے کے لیے: میری بکنگز کھولیں اور جو بکنگ مالک کے جواب کی منتظر ہو اس پر \"درخواست منسوخ کریں\" دبائیں۔ جوابی پیشکش پر انکار بھی دبا سکتے ہیں۔",
      ro: "Cancel karne ke liye: My Bookings kholein aur jo booking maalik ke jawab ki muntazir ho us par \"Cancel request\" dabayein. Counter-offer par Decline bhi daba sakte hain.",
    });
  }
  if (has(/status|track|confirm(ed)? hua|kab confirm|my booking|meri booking|بکنگ کی صورتحال|میری بکنگ/i)) {
    return steps({
      en: "Track every booking in My Bookings. Each one moves through 4 steps: Request Sent → Owner Confirmed → Rental Completed → Feedback Submitted. If you sent a price offer, the owner may reply with a counter-offer that you can accept or decline.",
      ur: "ہر بکنگ میری بکنگز میں دیکھیں۔ چار مراحل: درخواست بھیجی گئی → مالک نے تصدیق کی → کرایہ مکمل → رائے جمع۔ قیمت کی پیشکش پر مالک جوابی پیشکش بھیج سکتا ہے۔",
      ro: "Har booking My Bookings mein dekhein. 4 marhalay: Request Sent → Owner Confirmed → Rental Completed → Feedback Submitted. Price offer par maalik counter-offer bhej sakta hai.",
    });
  }
  if (has(/list (my |a )?(machine|tractor)|apni machine|machine (list|lagani|daalni|dalni)|add (my )?machine|owner portal|\bearn|kamai|kamana|مالک|اپنی مشین|کمائی/i)) {
    return steps({
      en: "To list your machine:\n1. Sign up as a Machinery Owner (or sign in).\n2. Open Owner Portal → \"List Available Machinery\".\n3. Enter machine name, category, hourly rate, district, village, distance and operator/transport terms. Fuel is always dry rent.\n4. Press \"Add to marketplace\". It goes live at once.\nIn Owner Portal → Requests you can approve, counter or decline offers, and the Earnings Estimator shows possible seasonal income.",
      ur: "اپنی مشین درج کرنے کا طریقہ:\n1. مشینری مالک کے طور پر سائن اپ یا سائن ان کریں۔\n2. مالک پورٹل → \"دستیاب مشینری درج کریں\" کھولیں۔\n3. مشین کا نام، قسم، فی گھنٹہ کرایہ، ضلع، گاؤں، فاصلہ اور آپریٹر/ٹرانسپورٹ کی شرائط لکھیں۔ ڈیزل ہمیشہ ڈرائی رینٹ ہے۔\n4. \"مارکیٹ میں شامل کریں\" دبائیں، مشین فوراً نظر آئے گی۔\nدرخواستیں ٹیب میں آپ پیشکش منظور، جوابی پیشکش یا انکار کر سکتے ہیں۔",
      ro: "Apni machine list karne ka tareeqa:\n1. Machinery Owner ke tor par sign up ya sign in karein.\n2. Owner Portal → \"List Available Machinery\" kholein.\n3. Machine ka naam, category, ghante ka rate, district, gaon, distance aur operator/transport ki shartein likhein. Diesel hamesha dry rent hai.\n4. \"Add to marketplace\" dabayein, machine foran live ho jayegi.\nRequests tab mein aap offers approve, counter ya decline kar sakte hain.",
    });
  }
  if (has(/transport|truck|لانے|ٹرانسپورٹ/i)) {
    return steps({
      en: "Transport is distance based: PKR 100 per km from the owner's area, with a minimum of PKR 500. For example 4 km = PKR 500, 12 km = PKR 1,200. Some owners include transport free. You can also offer a lower transport price in the booking form.",
      ur: "ٹرانسپورٹ فاصلے کے حساب سے ہے: 100 روپے فی کلومیٹر، کم از کم 500 روپے۔ مثلاً 4 کلومیٹر = 500، 12 کلومیٹر = 1,200۔ کچھ مالک ٹرانسپورٹ مفت دیتے ہیں۔ بکنگ فارم میں کم ٹرانسپورٹ کی پیشکش بھی کر سکتے ہیں۔",
      ro: "Transport distance ke hisaab se hai: Rs 100 fi km, kam az kam Rs 500. Masalan 4 km = 500, 12 km = 1,200. Kuch maalik transport free dete hain. Booking form mein kam transport ki offer bhi kar sakte hain.",
    });
  }
  if (has(/^(?!.*\d).*(how (do|can|to) (i )?(book|rent)|booking kaise|book kaise|kiraye par kaise|rent kaise|بکنگ کیسے|کیسے بک)/i)) {
    return steps({
      en: "To book a machine:\n1. In Marketplace, pick a category and district and set the search radius (15 km default, up to 25 km).\n2. Press \"Request Booking\" on a machine (sign in if asked).\n3. Choose date and hours, add operator or transport if needed, and check the full price breakdown.\n4. Optional: turn on \"Suggest your own price\".\n5. Tick the dry-rent terms, pick a payment option and send. Track it in My Bookings.",
      ur: "مشین بک کرنے کا طریقہ:\n1. مارکیٹ میں قسم، ضلع اور تلاش کا دائرہ چنیں (15 سے 25 کلومیٹر)۔\n2. مشین پر \"بکنگ کی درخواست\" دبائیں (ضرورت ہو تو سائن ان کریں)۔\n3. تاریخ اور گھنٹے چنیں، آپریٹر یا ٹرانسپورٹ شامل کریں اور مکمل قیمت دیکھیں۔\n4. چاہیں تو \"اپنی قیمت تجویز کریں\" آن کریں۔\n5. ڈرائی رینٹ کی شرط مانیں، ادائیگی چنیں اور بھیج دیں۔ میری بکنگز میں دیکھیں۔",
      ro: "Machine book karne ka tareeqa:\n1. Marketplace mein category, district aur search radius chunein (15 se 25 km).\n2. Machine par \"Request Booking\" dabayein (zaroorat ho to sign in karein).\n3. Date aur ghante chunein, operator ya transport add karein aur poori qeemat dekhein.\n4. Chahein to \"Suggest your own price\" on karein.\n5. Dry-rent shart maanein, payment chunein aur bhej dein. My Bookings mein track karein.",
    });
  }
  if (has(/language|zaban|zubaan|urdu|punjabi|sindhi|زبان|اردو|پنجابی/i)) {
    return steps({
      en: "Use the language menu at the top right to switch between English, Urdu, Punjabi and Sindhi (Sindhi is a planned expansion preview). The page flips to right-to-left for Urdu, Punjabi and Sindhi.",
      ur: "اوپر زبان کے مینو سے انگریزی، اردو، پنجابی اور سندھی (مستقبل کا پیش منظر) میں سے چنیں۔",
      ro: "Upar language menu se English, Urdu, Punjabi aur Sindhi (planned preview) mein se chunein.",
    });
  }
  if (has(/privacy|data|safe|secure|mehfooz|محفوظ|ڈیٹا/i)) {
    return steps({
      en: "Agri-Share keeps only what it needs: name, email, mobile and district, with your permission (Section 12.2). Passwords are never stored in plain text. Only the project owner can see the member list.",
      ur: "ایگری شیئر صرف ضروری معلومات رکھتا ہے: نام، ای میل، موبائل اور ضلع، آپ کی اجازت سے (سیکشن 12.2)۔ پاس ورڈ سادہ متن میں محفوظ نہیں ہوتا۔",
      ro: "Agri-Share sirf zaroori maloomat rakhta hai: naam, email, mobile aur district, aap ki ijazat se (Section 12.2). Password saada text mein save nahi hota.",
    });
  }
  if (has(/what is agri|agri-?share kya|about|kya hai ye|ye kya hai|ایگری شیئر کیا|کیا ہے/i)) {
    return steps({
      en: "Agri-Share is a peer-to-peer agricultural machinery rental and crop marketplace connecting farmers, machinery owners, and bulk buyers across Pakistan and beyond. Tagline: Sharing Resources, Growing Together.",
      ur: "ایگری شیئر ایک پلیٹ فارم ہے جو پنجاب کے کسانوں کو ٹریکٹر، تھریشر اور ہارویسٹر کے فارغ مالکان سے ملاتا ہے۔ نعرہ: وسائل بانٹیں، مل کر بڑھیں۔",
      ro: "Agri-Share aik platform hai jo Punjab ke kisanon ko tractor, thresher aur harvester ke maalikon se milata hai. Tagline: Sharing Resources, Growing Together.",
    });
  }
  if (has(/contact|support|help ?line|complain|shikayat|رابطہ|شکایت/i)) {
    return steps({
      en: "Call the Agri-Share support helpline 0800-AGRI-1, or ask your local Agri-Agent. You can also ask me anything about using the website.",
      ur: "ایگری شیئر سپورٹ ہیلپ لائن 0800-AGRI-1 پر کال کریں، یا اپنے مقامی ایگری ایجنٹ سے بات کریں۔ آپ ویب سائٹ کے بارے میں مجھ سے کچھ بھی پوچھ سکتے ہیں۔",
      ro: "Agri-Share support helpline 0800-AGRI-1 par call karein, ya apne local Agri-Agent se baat karein.",
    });
  }
  if (/diesel|fuel|petrol|dry|ڈیزل|تیل|ایندھن/i.test(text)) {
    return L({
      en: "Agri-Share uses dry renting: the hourly rate excludes diesel/fuel. The renter supplies fuel. Before confirming, both sides agree on fuel, operator, transport and how extra time or late return is charged.",
      ur: "ایگری شیئر ڈرائی رینٹ پر کام کرتا ہے: فی گھنٹہ کرائے میں ڈیزل شامل نہیں، ڈیزل کسان دیتا ہے۔ تصدیق سے پہلے دونوں فریق ڈیزل، آپریٹر، ٹرانسپورٹ اور زائد وقت کی شرائط طے کرتے ہیں۔",
      ro: "Agri-Share dry rent par chalta hai: ghante ke kiraye mein diesel shamil nahi, diesel kisan deta hai. Confirm se pehle dono taraf diesel, operator, transport aur zaid waqt ki shartein tay karti hain.",
    });
  }
  if (/commission|fee|charges|کمیشن|فیس/i.test(text)) {
    return L({
      en: "The platform commission is 6% (5% to 7% range). Smallholders farming under 5 acres pay a subsidised 4%: tick the smallholder box in the booking form. It is shown as a separate line and added to the renter's bill before confirmation, so there are no hidden charges.",
      ur: "پلیٹ فارم کمیشن 6% ہے (5 سے 7% حد)۔ 5 ایکڑ سے کم والے چھوٹے کسانوں کے لیے رعایتی 4%، بکنگ فارم میں چھوٹے کسان کا خانہ منتخب کریں۔ یہ تصدیق سے پہلے الگ لائن میں دکھایا جاتا ہے اور کسان کے بل میں شامل ہوتا ہے، کوئی چھپی فیس نہیں۔",
      ro: "Platform commission 6% hai (5 se 7% range). 5 acre se kam wale chhote kisanon ke liye riayati 4%, booking form mein smallholder box tick karein. Ye confirm se pehle alag line mein dikhaya jata hai aur kisan ke bill mein shamil hota hai, koi chhupi fees nahi.",
    });
  }
  if (/operator|driver|ڈرائیور|آپریٹر|chalane/i.test(text)) {
    return L({
      en: "Operator terms tell you who drives the machine. Included: the owner's trained driver comes with the machine and is already in the hourly rate. Optional: you can add the owner's driver for +Rs 500/hr, or drive it yourself. Not provided: you must bring your own driver. Harvesters usually come with a trained operator.",
      ur: "ہر فہرست میں آپریٹر کی شرط لکھی ہوتی ہے: کرائے میں شامل، اختیاری (+500 روپے فی گھنٹہ)، یا نہیں (اپنا ڈرائیور لائیں)۔ ہارویسٹر عام طور پر تربیت یافتہ آپریٹر کے ساتھ آتے ہیں۔",
      ro: "Har listing mein operator ki shart likhi hoti hai: kiraye mein shamil, optional (+Rs 500/ghanta), ya nahi (apna driver laayein). Harvester aam tor par trained operator ke saath aate hain.",
    });
  }
  if (/agent|ussd|smartphone|button phone|simple phone|ایجنٹ|سمارٹ/i.test(text)) {
    return L({
      en: "No smartphone? A local Agri-Agent (your village shopkeeper) can search machines and submit a booking for you. See the Agri-Agent & USSD tab.",
      ur: "اسمارٹ فون نہیں؟ گاؤں کا ایگری ایجنٹ (دکاندار) آپ کے لیے مشین تلاش کر کے بکنگ بھیج سکتا ہے۔ ایگری ایجنٹ اور USSD ٹیب دیکھیں۔",
      ro: "Smartphone nahi? Gaon ka Agri-Agent (dukandar) aap ke liye machine dhoond kar booking bhej sakta hai. Agri-Agent tab dekhein.",
    });
  }
  if (/pay|easypaisa|jazzcash|cash|ادائیگی|پیسے|paise|payment/i.test(text)) {
    return L({
      en: "You can pay with EasyPaisa, JazzCash, or cash through a local Agri-Agent.",
      ur: "آپ ایزی پیسہ، جاز کیش، یا مقامی ایگری ایجنٹ کے ذریعے نقد ادائیگی کر سکتے ہیں۔",
      ro: "Payment: EasyPaisa, JazzCash, ya Agri-Agent ke zariye cash.",
    });
  }
  // "rate / kiraya / کرایہ / price / kitne ka" without acres or hours: today's typical hourly rates
  if (/\brate|rates|price|kiraya|kiraye|kiraaya|kitne ka|kitna|kharcha|kharch|qeemat|keemat|کرایہ|کرائے|کرایا|ریٹ|قیمت|خرچ|کتنے کا|کتنا|مسواڙ|اگهه|بیه|کرایه/i.test(text)) {
    const cats = machine ? [machine] : ["tractor", "thresher", "harvester"];
    const rows = cats.map((c) => `• ${name(c)}: ${money(avgRate(c))} ${L({ en: "per hour", ur: "فی گھنٹہ", ro: "fi ghanta" })}`).join("\n");
    return L({ en: "Typical hourly rates right now:", ur: "اس وقت عام فی گھنٹہ کرایہ:", ro: "Is waqt aam ghante ka kiraya:" }) + "\n" + rows + "\n\n" +
      L({ en: "Want a lower price? Use Apni Boli (Name Your Price): enter your own rate and nearby owners send offers. Tell me your acres for a full cost estimate.",
          ur: "کم قیمت چاہیے؟ اپنی بولی استعمال کریں: اپنا ریٹ بتائیں، قریبی مالکان آفرز بھیجیں گے۔ پورے خرچ کے لیے اپنے ایکڑ بتائیں۔",
          ro: "Kam qeemat chahiye? Apni Boli istemal karein: apna rate batayein, qareebi maalik offers bhejenge. Poore kharche ke liye apne acre batayein." });
  }
  if (machine || wheat || maize || rice || /which|kaun|konsi|کون|recommend/i.test(text)) {
    const rec = wheat || rice ? "harvester" : maize ? "thresher" : machine || "tractor";
    const nearest = avail.filter((l) => l.category === rec).sort((a, b) => a.distance - b.distance)[0];
    const near = nearest ? L({ en: `\nNearest listed: ${nearest.name}, ${nearest.distance} km, ${money(nearest.rate)}/hr.`, ur: `\nقریب ترین: ${nearest.name}، ${nearest.distance} کلومیٹر، ${money(nearest.rate)} فی گھنٹہ۔`, ro: `\nSab se qareeb: ${nearest.name}, ${nearest.distance} km, ${money(nearest.rate)}/ghanta.` }) : "";
    return L({
      en: `Quick guide: land preparation and sowing → tractor (about 1 h/acre). Wheat or rice harvesting → combine harvester (about 0.8 h/acre). Threshing harvested wheat or shelling maize → thresher (about 1.5 h/acre). Tell me your acres for a cost estimate.`,
      ur: `مختصر رہنمائی: زمین کی تیاری اور بیجائی → ٹریکٹر (تقریباً 1 گھنٹہ فی ایکڑ)۔ گندم یا دھان کی کٹائی → کمبائن ہارویسٹر (تقریباً 0.8 گھنٹہ فی ایکڑ)۔ گہائی یا مکئی کے دانے → تھریشر (تقریباً 1.5 گھنٹہ فی ایکڑ)۔ خرچ کے لیے ایکڑ بتائیں۔`,
      ro: `Mukhtasar guide: zameen ki tayyari aur bijai → tractor (taqreeban 1 ghanta/acre). Gandum ya dhan ki katai → combine harvester (taqreeban 0.8 ghanta/acre). Gahai ya makai ke daane → thresher (taqreeban 1.5 ghanta/acre). Kharche ke liye acre batayein.`,
    }) + near;
  }
  return LX("menu", {
    en: "I can help with:\n• Using the website: sign up, sign in, booking, price offers, listing a machine\n• Hours needed: \"How long to harvest 5 acres of wheat?\"\n• Cost: \"Tractor for 6 hours, how much?\"\n• Dry rent, operator, transport, commission, payment, Agri-Agents",
    ur: "میں ان میں مدد کر سکتا ہوں:\n• ویب سائٹ کا استعمال: سائن اپ، سائن ان، بکنگ، قیمت کی پیشکش، مشین درج کرنا\n• گھنٹے: \"5 ایکڑ گندم کی کٹائی میں کتنا وقت؟\"\n• خرچ: \"ٹریکٹر 6 گھنٹے کتنے کا؟\"\n• ڈرائی رینٹ، آپریٹر، کمیشن، ادائیگی، ایگری ایجنٹ",
    ro: "Main in mein madad kar sakta hoon:\n• Website: sign up, sign in, booking, price offer, machine list karna\n• Ghante: \"5 acre gandum ki katai mein kitna waqt?\"\n• Kharcha: \"Tractor 6 ghante kitne ka?\"\n• Dry rent, operator, commission, payment, Agri-Agent",
  });
}

function buildPrompt(history, listings, session, dieselPrice = DIESEL_BENCHMARK, uiLang = "en", voice = false) {
  const langName = (LANGS.find((l) => l.code === uiLang) || LANGS[0]).name;
  const lst = listings.filter((l) => l.available).map((l) => `- ${l.name} (${l.category}) in ${l.village}, ${l.district}: PKR ${l.rate}/hr, ${l.distance} km, operator ${l.operator}, transport ${l.transport}, owner ${l.ownerId}`).join("\n");
  const convo = history.map((m) => `${m.role === "user" ? "Farmer" : "Helper"}: ${m.text}`).join("\n");
  const ctry = CUR.id === "PK" ? "" : `\nSelected country/region: ${({ CN: "China", IN: "India", US: "USA / Europe", ME: "Middle East / Africa" })[CUR.id]}. Quote prices in ${CUR.code} (reference rate 1 USD = ${USD_PKR} PKR; listing rates below are stored in PKR, convert them). Local machinery in this region: ${CUR.catalog.map((m) => `${m.name} (${m.spec}, about ${fmtLocal(m.min)} to ${fmtLocal(m.max)}/hr)`).join("; ")}. Pakistani rules about transport fees, diesel price and USSD apply only in Pakistan.`;
  return `${ctry ? "CONTEXT:" + ctry + "\n\n" : ""}You are "Agri-Share Kisan Helper", a friendly assistant for Agri-Share, a peer-to-peer agricultural machinery rental and crop marketplace for Pakistan (tagline "Sharing Resources, Growing Together").
Rules of the platform:
- Categories: tractors, threshers, harvesters. Farmers anywhere in Pakistan can set their location (province, district, village, map pin or GPS). 15 km default in-app search, up to 25 km catchment; Apni Boli requests search up to 100 km.
- Dry rent: hourly rate EXCLUDES diesel/fuel; renter supplies fuel. Overtime and late-return terms agreed with owner before confirmation.
- Operator terms = who drives the machine: "included" (owner's driver, already in rate), "optional" (+PKR 500/hr for the owner's driver), "none" (renter brings own driver).
- Transport is distance based: PKR 100 per km, minimum PKR 500 (some owners include it). Platform commission 6% standard (5 to 7% range), 4% subsidised for smallholders under 5 acres, added to the subtotal.
- Price offers: in the booking form the renter can turn on "Suggest your own price" (hourly offer at least 60% of listed rate, plus a transport offer and a note). The owner can Accept, Counter or Decline in Owner Portal > Requests; counters appear in My Bookings to accept or decline.
- Payments: EasyPaisa, JazzCash, cash via local Agri-Agent. Do not promise escrow or insurance cover.
- Rough rules of thumb: tractor about 1 h/acre for land prep; combine harvester about 0.8 h/acre; thresher about 1.5 h/acre of crop. Diesel roughly tractor 4 L/h, thresher 3 L/h, harvester 10 L/h.
- Rates are set by owners; present cost figures as estimates to confirm with the owner.
How to use the website (guide users step by step when they ask):
- Sign up: top-right "Sign up" > full name, email, mobile 03XXXXXXXXX, district, role (Farmer/Renter, Machinery Owner, Agri-Agent), password 6+ chars twice, accept privacy note > "Create account". Booking or listing without an account opens sign up automatically.
- Sign in: top-right "Sign in" > email + password. Forgot password: "Forgot password?" in the sign-in box > email + new password twice.
- Sign out: click your name/initials at top right > Sign out.
- Book: Marketplace > filters (category, district, radius 15 km default up to 25 km, search) > "Request Booking" > date, hours, operator/transport toggles, optional price offer, tick dry-rent terms, choose planned payment (EasyPaisa, JazzCash, cash via Agri-Agent) > send. Track in My Bookings: Request Sent > Owner Confirmed > Rental Completed > Feedback Submitted. Cancel while waiting.
- List a machine: Owner Portal > "List Available Machinery" > name, category, hourly rate, district, village, distance, operator and transport terms > "Add to marketplace". Earnings Estimator in Owner Portal.
- Apni Boli, "Name Your Price" ("Post a Request" tab; Urdu اپنی بولی): farmer picks machine, village, hours, date, his own offered rate, and Dry rent (farmer buys diesel) or Wet rent (owner supplies diesel at market rate; current admin benchmark Rs ${dieselPrice}/L, prices change almost daily). Owners appear on a live radar and accept or counter-offer (often +Rs 200/hr); farmer accepts or declines. 3-tier smart radius: Tier 1 village 1 to 5 km (transport Rs 0 to 500), Tier 2 pilot catchment 15 to 25 km (Rs 60/km each way), Tier 3 regional emergency backup up to 100 km with a full cost breakdown (rent, transport, diesel, 6% commission, grand total). "No match, expand search" button moves to the next tier.
- Commission: 6% standard (5 to 7% range); smallholders under 5 acres tick a box for a subsidised 4%.
- Harvest Now, Pay Later: payment option in the booking form (and the Apni Boli confirm step). Farmer pays 30% now; 70% is lent by a third-party microfinance partner (proposed only, no agreement: JazzCash Credit, EasyPaisa, ZTBL), due after harvest (60 to 180 days). Partner carries the credit risk, Agri-Share carries none.
- Agri-Market tab (called Agri-Mandi / منڈی in Urdu and regional languages) (Sell Harvest): farmer posts wheat, rice, maize or cotton with quantity in mann (40 kg), quality, village, expected PKR per mann and JazzCash/EasyPaisa wallet. Sample flour mills, rice mills, feed mills, ginners and bulk buyers bid live on the farmer's price. Closed-Loop Settlement: on sale, pending 70% machinery credit is repaid first and the net profit goes to the farmer's wallet. Guide prices per mann: wheat about Rs 5,000, cotton phutti about Rs 8,900 (recent Punjab reports); rice paddy about Rs 4,200 and maize about Rs 2,900.
- Keypad phones: toll-free helpline 0800-AGRI-1 and USSD *AGRI# with Punjabi/Urdu IVR: 1 rent a machine, 2 sell crop, 0 agent.
- No smartphone: Agri-Agent & USSD tab shows the village shopkeeper model and the USSD booking flow.
- Language menu at top right: English, Urdu, Punjabi, Sindhi (preview).
- Privacy (Section 12.2): only name, email, mobile, district with consent; passwords are hashed; only the project owner sees the member list.
${session ? `The farmer is signed in as ${session.name} (${session.role}).` : "The farmer is not signed in."}
Current listings:
${lst}
Answer ANY question: about using this website, renting, farming machinery, crops, or general topics. ${uiLang === "en" ? "The app is in English: reply in the language and script the farmer used (English, Urdu script, or Roman Urdu)." : `The farmer selected ${langName} in the app: reply in ${langName}, written in its usual Perso-Arabic script, unless the farmer clearly writes in another language. If unsure of a ${langName} word, keep it simple rather than switching to English.`} SCRIPT RULE: never write Hindi or any Devanagari characters. Urdu must be in Urdu (Perso-Arabic) script and Punjabi in Shahmukhi (Perso-Arabic) script; use Roman Urdu or Roman Punjabi only if the farmer wrote in Roman letters.${voice ? (uiLang === "en" ? " This is a live voice call in English: reply only in English." : ` This is a live voice call in ${langName}: reply only in ${langName}.`) + " Your reply will be read aloud to a farmer who may not read: use 2 to 4 short spoken sentences, no lists, no symbols, no tables." : ""} In English replies call the crop-selling tab "Agri-Market". Keep answers short (under 150 words), use numbered steps for how-to questions, show the arithmetic for cost estimates, and never use em dashes.

Conversation so far:
${convo}
Helper:`;
}

/* Voice: Claude dictation + Claude voice inside claude.ai (tap to talk each turn, because the platform
   needs a tap to start listening); the browser's Web Speech API elsewhere (hands-free in Chrome/Edge).
   Browsers recognise English and Urdu; Punjabi, Sindhi, Pashto and Balochi are heard through Urdu
   recognition and read by an Urdu voice when no voice for that language is installed. */
/* Optional Gemini model for the Kisan Helper on Vercel. Set VITE_GEMINI_API_KEY in Vercel's
   Environment Variables (and optionally VITE_GEMINI_MODEL). Without a key, or if Gemini fails,
   the built-in multilingual farming engine (ruleAnswer) answers instead. */
const VITE_ENV = (typeof import.meta !== "undefined" && import.meta.env) || {};
const GEMINI_KEY = VITE_ENV.VITE_GEMINI_API_KEY || "";
const GEMINI_MODEL = VITE_ENV.VITE_GEMINI_MODEL || "gemini-flash-latest";
async function askGemini(prompt) {
  if (!GEMINI_KEY) return "";
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => ctrl && ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 700 } }),
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!res.ok) { console.warn("[Agri-Share] Gemini error", res.status); return ""; }
    const data = await res.json();
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((x) => x.text || "").join("").trim();
  } catch (e) { console.warn("[Agri-Share] Gemini unreachable, using the built-in helper", e); return ""; }
  finally { clearTimeout(timer); }
}

// Speech recognition languages (BCP-47). Urdu, Punjabi, Sindhi, Pashto and Balochi listen as Urdu (ur-PK):
// browsers transcribe local speech reliably there, while pa-PK etc. fail silently. If a browser rejects a
// code ("language-not-supported") the next one in the chain is tried; hi-IN output is converted to Urdu script.
const STT_LANG = { en: "en-PK", ur: "ur-PK", pa: "ur-PK", sd: "ur-PK", ps: "ur-PK", bal: "ur-PK" };
const STT_CHAIN = { en: ["en-PK", "en-US"], local: ["ur-PK", "ur-IN", "hi-IN"] };
const sttChain = (lang) => (lang === "en" ? STT_CHAIN.en : STT_CHAIN.local);

/* Script lock: Urdu / Punjabi output must be Perso-Arabic (Urdu / Shahmukhi), never Hindi (Devanagari).
   If a model or a speech engine ever returns Devanagari, it is transliterated to Urdu script before it
   is shown, saved or spoken. The mapping is phonetic and approximate, but always the right script. */
const DEVANAGARI_RE = /[\u0900-\u097F]/;
const DEVA_CONS = { "क": "ک", "ख": "کھ", "ग": "گ", "घ": "گھ", "ङ": "ن", "च": "چ", "छ": "چھ", "ज": "ج", "झ": "جھ", "ञ": "ن", "ट": "ٹ", "ठ": "ٹھ", "ड": "ڈ", "ढ": "ڈھ", "ण": "ن", "त": "ت", "थ": "تھ", "द": "د", "ध": "دھ", "न": "ن", "प": "پ", "फ": "پھ", "ब": "ب", "भ": "بھ", "म": "م", "य": "ی", "र": "ر", "ल": "ل", "व": "و", "श": "ش", "ष": "ش", "स": "س", "ह": "ہ", "क़": "ق", "ख़": "خ", "ग़": "غ", "ज़": "ز", "फ़": "ف", "ड़": "ڑ", "ढ़": "ڑھ", "य़": "ی" };
const DEVA_VOW = { "अ": "ا", "आ": "آ", "इ": "ا", "ई": "ای", "उ": "ا", "ऊ": "او", "ए": "اے", "ऐ": "اے", "ओ": "او", "औ": "او", "ऋ": "رِ" };
const DEVA_MATRA = { "ा": "ا", "ि": "", "ी": "ی", "ु": "", "ू": "و", "े": "ے", "ै": "ے", "ो": "و", "ौ": "و", "ृ": "ر", "्": "" };
function devaToUrdu(text) {
  const src = String(text || "").normalize("NFC").replace(/([कखगजडढफय])\u093C/g, (m, c) => c + "़");
  let out = "";
  const chars = [...src];
  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    if (chars[i + 1] === "\u093C" && DEVA_CONS[c + "\u093C"]) { c = c + "\u093C"; i++; }
    const next = chars[i + 1] || "";
    const end = !next || /[\s.,!?।॥]/.test(next);
    if (DEVA_CONS[c] || DEVA_CONS[c.normalize("NFD")]) out += DEVA_CONS[c] || DEVA_CONS[c.normalize("NFD")];
    else if (DEVA_VOW[c]) {
      const prev = chars[i - 1] || "";
      const medial = /[\u0900-\u097F]/.test(prev);
      out += medial ? ({ "अ": "ا", "आ": "ا", "इ": "ئ", "ई": "ئی", "उ": "ؤ", "ऊ": "ؤ", "ए": end ? "ئے" : "ئی", "ऐ": "ئے", "ओ": "و", "औ": "و" }[c] || DEVA_VOW[c]) : DEVA_VOW[c];
    }
    else if (c in DEVA_MATRA) out += c === "े" || c === "ै" ? (end ? "ے" : "ی") : c === "ि" && end ? "ی" : DEVA_MATRA[c];
    else if (c === "ं" || c === "ँ") out += end ? "ں" : "ن";
    else if (c === "ः") out += "ہ";
    else if (c === "।" || c === "॥") out += "۔";
    else if (c >= "०" && c <= "९") out += String(c.charCodeAt(0) - 0x0966);
    else if (c === "\u093C") continue;
    else out += c;
  }
  return out;
}
const fixScript = (text, lang) => (lang !== "en" && DEVANAGARI_RE.test(String(text || "")) ? devaToUrdu(text).replace(/\?/g, "؟") : String(text || ""));
const TTS_PREF = { en: ["en"], ur: ["ur"], pa: ["pa", "ur"], sd: ["sd", "ur"], ps: ["ps", "ur"], bal: ["ur"] };
// Browser voice picking: exact language first, then Urdu (ur-PK, ur-IN). When no Urdu voice is installed
// (common on macOS / iOS / desktop Chrome) the reply is read in Roman Urdu by a Hindi or English voice,
// so the helper is never silent.
const VOICE_ORDER = { en: ["en-pk", "en-in", "en-gb", "en-us", "en"], ur: ["ur-pk", "ur-in", "ur"], pa: ["pa", "ur-pk", "ur-in", "ur"], sd: ["sd", "ur-pk", "ur-in", "ur"], ps: ["ps", "ur-pk", "ur-in", "ur"], bal: ["ur-pk", "ur-in", "ur"] };
const ROMAN_VOICE_ORDER = ["hi-in", "hi", "en-in", "en-pk", "en-gb", "en-us", "en"];
function pickVoice(voices, codes) {
  const norm = (v) => String(v.lang || "").toLowerCase().replace("_", "-");
  for (const c of codes) {
    const exact = voices.filter((v) => norm(v) === c || (c.length === 2 && norm(v).startsWith(c + "-")) || norm(v) === c);
    if (exact.length) return exact.find((v) => /google|natural|enhanced|premium/i.test(v.name)) || exact.find((v) => v.localService) || exact[0];
  }
  return null;
}
const speakable = (txt) => String(txt || "").replace(/[•●]/g, "").replace(/→/g, ", ").replace(/[|*#_`]/g, " ").replace(/\n+/g, ". ").replace(/\s{2,}/g, " ").trim().slice(0, 1800);

function VoiceWaves({ active, tone }) {
  return (
    <div className="flex h-16 items-center justify-center gap-1" aria-hidden="true">
      {Array.from({ length: 13 }).map((_, i) => (
        <span key={i} className={`w-1.5 rounded-full ${tone === "speak" ? "bg-gold" : "bg-leaf"} ${active ? "voice-bar" : ""}`}
          style={{ height: active ? undefined : 6, animationDelay: `${(i % 5) * 0.11 + (i % 3) * 0.07}s`, animationDuration: `${0.7 + (i % 4) * 0.13}s` }} />
      ))}
    </div>
  );
}

function KisanHelper({ t, listings, open, setOpen, session, dieselPrice, lang = "en" }) {
  const [messages, setMessages] = useState(() => [{ role: "assistant", text: t("kh_hello"), id: 0 }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("offline");
  const sampleRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  // ---- voice call state
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | listening | thinking | speaking | tap | demo
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [muted, setMuted] = useState(false);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [engines, setEngines] = useState({ dict: false, tts: false });
  const dictRef = useRef(null), ttsRef = useRef(null), recRef = useRef(null);
  const callRef = useRef(false), mutedRef = useRef(false), bufRef = useRef(""), silenceRef = useRef(null), demoRef = useRef(false), ttsLangsRef = useRef(null);
  const sttIdxRef = useRef(0);          // position in the recognition language chain (advances on language-not-supported)
  const silentRef = useRef(0);          // consecutive turns with no speech heard
  const voicesRef = useRef([]);         // browser voices (they load asynchronously in Chrome)
  const live = useRef({});              // latest send/listen/handleUtterance, so recognition callbacks never use stale state
  const SR = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.claude && typeof window.claude.use === "function") {
          const s = await window.claude.use("sample");
          if (alive && s) { sampleRef.current = s; setMode("claude"); return; }
        }
      } catch (e) { /* not available */ }
      try { if (alive && window.claude && typeof window.claude.complete === "function") { setMode("claude"); return; } } catch (e) { /* ignore */ }
      if (alive && GEMINI_KEY) setMode("gemini");
    })();
    (async () => {
      try {
        if (window.claude && typeof window.claude.use === "function") {
          const [d, tt] = await withTimeout(Promise.all([window.claude.use("dictation"), window.claude.use("tts")]), 10000, [null, null]);
          if (!alive) return;
          dictRef.current = d || null; ttsRef.current = tt || null;
          if (tt && tt.languages) { try { ttsLangsRef.current = await tt.languages(); } catch (e) { /* ignore */ } }
          setEngines({ dict: !!d, tts: !!tt });
        }
      } catch (e) { /* voice capabilities not offered here */ }
    })();
    return () => { alive = false; };
  }, []);

  // keep greeting in the selected UI language until the user starts chatting
  useEffect(() => {
    setMessages((m) => (m.length === 1 && m[0].id === 0 ? [{ role: "assistant", text: t("kh_hello"), id: 0 }] : m));
  }, [t]);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, open]);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const send = async (textArg, viaVoice) => {
    const text = fixScript((textArg != null ? textArg : input).trim(), lang);
    if (!text || busy) return "";
    setInput("");
    const userMsg = { role: "user", text, id: Date.now() };
    const botId = Date.now() + 1;
    const history = [...messages.filter((m) => m.id !== 0), userMsg];
    setMessages((m) => [...m, userMsg, { role: "assistant", text: "", id: botId, pending: true }]);
    setBusy(true);
    const setBot = (txt, extra = {}) => setMessages((m) => m.map((x) => (x.id === botId ? { ...x, text: fixScript(txt, lang), ...extra } : x)));
    const prompt = buildPrompt(history, listings, session, dieselPrice, lang, !!viaVoice);
    let answered = "";
    try {
      if (sampleRef.current) {
        const res = await sampleRef.current(prompt, { cache: false, modelTier: "quick", onText: ({ text: whole }) => setBot(whole) });
        if (res && res.text && res.text.trim()) { answered = fixScript(res.text.trim(), lang); setBot(answered, { pending: false, source: "claude" }); }
      } else if (window.claude && typeof window.claude.complete === "function") {
        const out = await window.claude.complete(prompt);
        const txt = typeof out === "string" ? out : out && out.text;
        if (txt && txt.trim()) { answered = fixScript(txt.trim(), lang); setBot(answered, { pending: false, source: "claude" }); }
      } else if (GEMINI_KEY) {
        const txt = await askGemini(prompt);
        if (txt) { answered = fixScript(txt, lang); setBot(answered, { pending: false, source: "gemini" }); }
      }
    } catch (e) {
      if (e && e.code === "not_granted") { sampleRef.current = null; setMode("offline"); }
    }
    if (!answered) { answered = ruleAnswer(text, listings, dieselPrice, lang); setBot(answered, { pending: false, source: "rules" }); }
    setBusy(false);
    return answered;
  };

  // ---------------- voice call engine ----------------
  useEffect(() => {
    if (!synth) return undefined;
    const load = () => { try { voicesRef.current = synth.getVoices() || []; } catch (e) { /* ignore */ } };
    load();
    try { synth.addEventListener("voiceschanged", load); } catch (e) { synth.onvoiceschanged = load; }
    return () => { try { synth.removeEventListener("voiceschanged", load); } catch (e) { /* ignore */ } };
  }, []); // eslint-disable-line
  // iOS / Safari only allow speech that starts inside a tap: speak a silent utterance on the call button tap
  const unlockTTS = () => {
    if (!synth) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(" "); u.volume = 0; synth.speak(u); synth.resume(); voicesRef.current = synth.getVoices() || voicesRef.current; } catch (e) { /* ignore */ }
  };
  // Is there a browser voice that can read this language's script?
  const hasNativeVoice = () => {
    if (ttsRef.current || !synth) return true;
    const voices = voicesRef.current.length ? voicesRef.current : (synth.getVoices() || []);
    return !!pickVoice(voices, VOICE_ORDER[lang] || VOICE_ORDER.en);
  };
  useEffect(() => { mutedRef.current = muted; if (muted) { try { ttsRef.current && ttsRef.current.stop().catch(() => {}); } catch (e) { /* ignore */ } try { synth && synth.cancel(); } catch (e) { /* ignore */ } } }, [muted]); // eslint-disable-line
  const ttsLangFor = () => {
    const list = ttsLangsRef.current;
    const pref = TTS_PREF[lang] || ["en"];
    if (!list) return pref[pref.length - 1];
    return pref.find((c) => list.includes(c)) || undefined;
  };
  // opts.roman: Roman Urdu version, read by a Hindi/English voice when no Urdu voice is installed
  // opts.force: speak even outside a call (chat "replay" button)
  const speakText = (txt, opts = {}) => new Promise((resolve) => {
    const clean = speakable(txt);
    if (!clean || mutedRef.current) { resolve(); return; }
    if (ttsRef.current) {
      const language = ttsLangFor();
      ttsRef.current.speak(clean, language ? { language } : undefined).then(() => resolve()).catch((e) => {
        if (e && e.code === "not_granted") { ttsRef.current = null; setEngines((x) => ({ ...x, tts: false })); setVoiceErr(t("vc_tts_off")); }
        resolve();
      });
      return;
    }
    if (synth) {
      try {
        synth.cancel();
        const voices = voicesRef.current.length ? voicesRef.current : (synth.getVoices() || []);
        let voice = pickVoice(voices, VOICE_ORDER[lang] || VOICE_ORDER.en);
        let say = clean;
        if (!voice && lang !== "en") {
          // no Urdu voice on this device: read Roman Urdu with a Hindi / English voice instead of staying silent
          voice = pickVoice(voices, ROMAN_VOICE_ORDER);
          say = speakable(opts.roman || clean);
          setVoiceNote(t("vc_no_voice"));
        }
        const parts = say.match(/[^.!?۔؟\n]+[.!?۔؟]?/g) || [say];
        let i = 0;
        const next = () => {
          if (i >= parts.length || mutedRef.current || (!callRef.current && !opts.force)) { resolve(); return; }
          const chunk = parts[i++].trim();
          if (!chunk) { next(); return; }
          const u = new SpeechSynthesisUtterance(chunk);
          if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang === "en" ? "en-US" : "ur-PK";
          u.rate = 0.97;
          // Safari sometimes never fires onend: move on after the expected duration so the call never freezes
          let done = false;
          const finish = () => { if (done) return; done = true; clearTimeout(guard); next(); };
          const guard = setTimeout(finish, 2500 + chunk.length * 110);
          u.onend = finish; u.onerror = finish;
          synth.speak(u);
          try { synth.resume(); } catch (e) { /* ignore */ }
        };
        next();
      } catch (e) { resolve(); }
      return;
    }
    // no voice output available: keep the caption on screen for a moment
    setTimeout(resolve, Math.min(6000, 1200 + clean.length * 35));
  });

  const handleUtterance = async (text) => {
    const said = fixScript(String(text || "").trim(), lang);
    if (!said || !callRef.current) { if (callRef.current) live.current.listen(false); return; }
    silentRef.current = 0;
    setHeard(said); setPhase("thinking");
    const ans = await live.current.send(said, true);
    if (!callRef.current) return;
    setReply(ans); setPhase("speaking");
    const roman = lang !== "en" && !hasNativeVoice() ? ruleAnswer(said, listings, dieselPrice, lang, "ro") : "";
    await speakText(ans, { roman });
    // short pause so the microphone does not catch the end of our own voice, then listen again
    if (callRef.current && !demoRef.current) setTimeout(() => { if (callRef.current && !demoRef.current) live.current.listen(false); }, 350);
  };

  // fromGesture: true when called straight from a click (Claude dictation requires it)
  const listen = (fromGesture) => {
    if (!callRef.current) return;
    setVoiceErr(""); setHeard(""); bufRef.current = "";
    const d = dictRef.current;
    if (d) {
      setPhase("listening");
      const p = d.start({ language: lang === "en" ? "en" : "ur" });
      p.catch((e) => {
        const code = e && e.code;
        if (code === "no_gesture") { setPhase("tap"); return; }
        if (code === "stopped") return;
        if (code === "unavailable" || code === "not_granted") { dictRef.current = null; setEngines((x) => ({ ...x, dict: false })); }
        setVoiceErr(code === "not_granted" ? t("vc_mic_blocked") : t("vc_mic_error")); setPhase("tap");
      });
      if (!fromGesture) { /* restarted after a reply: the platform may ask for a tap */ }
      return;
    }
    if (SR) {
      if (typeof window !== "undefined" && window.isSecureContext === false) { setVoiceErr(t("vc_mic_blocked")); setPhase("tap"); return; }
      try {
        const rec = new SR();
        recRef.current = rec;
        const chain = sttChain(lang);
        rec.lang = chain[Math.min(sttIdxRef.current, chain.length - 1)]; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        let finalText = "", interimText = "", noSpeech = false;
        let started = false;
        rec.onstart = () => { started = true; };
        // some embedded pages neither start nor report an error: treat silence from the engine as blocked
        const watchdog = setTimeout(() => {
          if (!started && callRef.current && recRef.current === rec) { try { rec.abort(); } catch (e) { /* ignore */ } setVoiceErr(t("vc_mic_blocked")); setPhase("tap"); }
        }, 4000);
        rec.onresult = (ev) => {
          let interim = "";
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
          }
          interimText = interim;
          setHeard(fixScript((finalText + " " + interim).trim(), lang));
        };
        rec.onerror = (ev) => {
          clearTimeout(watchdog);
          const err = ev && ev.error;
          if (err === "not-allowed" || err === "service-not-allowed") { if (callRef.current) setVoiceErr(t("vc_mic_blocked")); setPhase("tap"); finalText = "__blocked__"; }
          else if (err === "audio-capture") { if (callRef.current) setVoiceErr(t("vc_no_mic")); setPhase("tap"); finalText = "__blocked__"; }
          else if (err === "network") { if (callRef.current) setVoiceErr(t("vc_net")); setPhase("tap"); finalText = "__blocked__"; }
          else if (err === "language-not-supported") {
            // try the next language in the chain (e.g. ur-PK -> ur-IN -> hi-IN) before giving up
            if (sttIdxRef.current < sttChain(lang).length - 1) { sttIdxRef.current += 1; finalText = "__retry__"; }
            else { if (callRef.current) setVoiceErr(t("vc_lang_unsupported")); setPhase("tap"); finalText = "__blocked__"; }
          }
          else if (err === "no-speech") noSpeech = true;
          // "aborted": onend decides what to do
        };
        rec.onend = () => {
          clearTimeout(watchdog);
          if (recRef.current === rec) recRef.current = null;
          if (!callRef.current || finalText === "__blocked__") return;
          if (finalText === "__retry__") { setTimeout(() => callRef.current && live.current.listen(false), 150); return; }
          // Safari / "Done speaking" may end before a result is marked final: use the last interim words
          const said = (finalText || interimText).trim();
          if (said) { live.current.handleUtterance(said); return; }
          // nothing heard: retry once quietly, then stop and ask the farmer to tap (no endless silent loop)
          silentRef.current += 1;
          if (silentRef.current <= 1 && !noSpeech) { setTimeout(() => callRef.current && live.current.listen(false), 250); return; }
          silentRef.current = 0;
          setVoiceNote(t("vc_no_speech")); setPhase("tap");
        };
        setPhase("listening");
        rec.start();
      } catch (e) {
        console.warn("[Agri-Share] Speech recognition could not start:", e && e.message);
        setVoiceErr(e && /permission|not.?allowed|denied|secure/i.test(String(e.message || e.name)) ? t("vc_mic_blocked") : t("vc_mic_error")); setPhase("tap");
      }
      return;
    }
    setVoiceErr(t("vc_unsupported")); setPhase("tap");
  };

  live.current = { send, listen, handleUtterance };
  useEffect(() => { sttIdxRef.current = 0; }, [lang]);

  // Claude dictation: words arrive as partial/final events; send after a short pause
  useEffect(() => {
    const d = dictRef.current;
    if (!d || !engines.dict) return undefined;
    const offP = d.onPartial(({ text }) => { if (callRef.current && text) setHeard((bufRef.current + " " + text).trim()); });
    const offF = d.onFinal(({ text }) => {
      if (!callRef.current) return;
      bufRef.current = (bufRef.current + text).trim();
      setHeard(bufRef.current);
      clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(async () => {
        const said = bufRef.current; bufRef.current = "";
        try { await d.stop(); } catch (e) { /* ignore */ }
        live.current.handleUtterance(said);
      }, 1300);
    });
    const offS = d.onState(({ state, reason }) => {
      if (state === "idle" && callRef.current && reason && !["stopped"].includes(reason)) {
        if (reason === "not_granted") { setVoiceErr(t("vc_mic_blocked")); }
        setPhase((ph) => (ph === "listening" ? "tap" : ph));
      }
    });
    return () => { offP(); offF(); offS(); };
  }, [engines.dict]); // eslint-disable-line

  const stopAudio = () => {
    clearTimeout(silenceRef.current);
    try { recRef.current && recRef.current.abort(); } catch (e) { /* ignore */ }
    try { dictRef.current && dictRef.current.active() && dictRef.current.stop().catch(() => {}); } catch (e) { /* ignore */ }
    try { ttsRef.current && ttsRef.current.stop().catch(() => {}); } catch (e) { /* ignore */ }
    try { synth && synth.cancel(); } catch (e) { /* ignore */ }
  };
  const startCall = () => {
    setVoiceOpen(true); setReply(""); setHeard(""); setVoiceErr(""); setVoiceNote(""); demoRef.current = false;
    callRef.current = true; silentRef.current = 0;
    unlockTTS();
    try { listen(true); } catch (e) { setVoiceErr(t("vc_mic_blocked")); setPhase("tap"); } // must run inside the click for Claude dictation
    // tell the farmer early when the browser has already blocked the microphone
    try {
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: "microphone" }).then((p) => { if (p.state === "denied" && callRef.current && !demoRef.current) { setVoiceErr(t("vc_mic_blocked")); setPhase("tap"); } }).catch(() => {});
      }
    } catch (e) { /* not supported */ }
  };
  const endCall = () => { callRef.current = false; demoRef.current = false; stopAudio(); setPhase("idle"); setVoiceOpen(false); };
  const tapToTalk = () => {
    if (!callRef.current) callRef.current = true;
    demoRef.current = false; silentRef.current = 0; setVoiceErr(""); setVoiceNote("");
    unlockTTS();
    try { listen(true); } catch (e) { setVoiceErr(t("vc_mic_error")); setPhase("tap"); }
  };
  // chat history: replay any answer aloud
  const replay = (text) => { unlockTTS(); speakText(text, { force: true }); };
  const stopListening = () => {
    if (dictRef.current && dictRef.current.active()) { dictRef.current.stop().catch(() => {}); return; }
    try { recRef.current && recRef.current.stop(); } catch (e) { /* ignore */ }
  };
  // Simulated conversation for presentations where the microphone is blocked
  const runDemo = async () => {
    stopAudio(); callRef.current = true; demoRef.current = true; setVoiceErr(""); setVoiceOpen(true);
    const lines = (HELPER_CHIPS[lang] || HELPER_CHIPS.en).slice(0, 2);
    for (const line of lines) {
      if (!callRef.current) return;
      setPhase("listening"); setHeard("");
      await new Promise((r) => setTimeout(r, 1600)); // simulated farmer speaking
      if (!callRef.current) return;
      await handleUtterance(line);
    }
    if (callRef.current) { setPhase("idle"); demoRef.current = false; setHeard(""); }
  };
  useEffect(() => { if (!open && callRef.current) endCall(); }, [open]); // eslint-disable-line
  useEffect(() => () => { callRef.current = false; stopAudio(); }, []); // eslint-disable-line
  const voiceEngine = engines.dict ? "claude" : SR ? "browser" : "none";
  useEffect(() => { if (voiceOpen && voiceEngine === "none" && !demoRef.current) { setVoiceErr(t("vc_unsupported")); setPhase("tap"); } }, [voiceOpen, voiceEngine]); // eslint-disable-line
  const phaseLabel = { idle: t("vc_ready"), listening: t("vc_listening"), thinking: t("vc_thinking"), speaking: t("vc_speaking"), tap: t("vc_tap"), demo: t("vc_demo") }[phase] || "";

  const chips = HELPER_CHIPS[lang] || HELPER_CHIPS.en;

  return (
    <>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="kisan-helper" aria-label={t("kh_title")}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-30 inline-flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-gold font-bold text-soil shadow-xl shadow-soil/25 ring-4 ring-ivory hover:brightness-105 focus:outline-none focus-visible:ring-forest lg:bottom-6 lg:end-6 lg:h-auto lg:w-auto lg:px-4 lg:py-3">
        {open ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        <span className="hidden lg:inline">{t("kh_title")}</span>
      </button>
      {open && (
        <div id="kisan-helper" role="dialog" aria-label={t("kh_title")}
          className="fixed inset-x-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex max-h-[72vh] lg:bottom-6 flex-col overflow-hidden rounded-3xl border border-forest/15 bg-ivory shadow-2xl sm:inset-x-auto sm:end-4 sm:w-[390px]">
          <div className="flex items-center gap-3 bg-forest px-4 py-3 text-ivory">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ivory"><Logo className="h-8 w-8" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{t("kh_title")}</p>
              <p className="flex items-center gap-1 text-[11px] text-ivory/75">
                {mode !== "offline" ? <Sparkles className="h-3 w-3 text-gold" aria-hidden="true" /> : <Bot className="h-3 w-3" aria-hidden="true" />}
                {mode === "claude" ? t("kh_ai") + " · fallback ready" : mode === "gemini" ? "Gemini AI · fallback ready" : t("kh_offline")}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-ivory/10" aria-label={t("close")}><X className="h-5 w-5" /></button>
          </div>
          {voiceOpen && (
            /* Audio-only call screen: no transcript or reply text, so farmers who cannot read can still use it.
               The conversation is still saved in the chat history (shown after the call ends). */
            <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto bg-gradient-to-b from-forest to-[#0d3d22] px-4 pb-5 pt-4 text-center text-ivory" role="region" aria-label={t("vc_title")} data-voice-screen>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gold"><AudioLines className="h-4 w-4" aria-hidden="true" />{t("vc_title")}</p>
              {voiceErr ? (
                <div className="flex w-full flex-1 flex-col items-center justify-center gap-3" role="alert">
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 ring-4 ring-red-400/30"><MicOff className="h-10 w-10 text-red-200" aria-hidden="true" /></span>
                  <p className="max-w-[290px] text-sm font-semibold leading-snug">{voiceErr}</p>
                  <button type="button" onClick={runDemo} className="inline-flex w-full max-w-[290px] items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-4 text-base font-extrabold text-soil shadow-lg transition active:scale-95" data-demo>
                    <PlayCircle className="h-6 w-6" aria-hidden="true" />{t("vc_demo_btn")}
                  </button>
                  {voiceEngine !== "none" && <button type="button" onClick={tapToTalk} className="inline-flex items-center gap-1.5 rounded-full bg-ivory/15 px-4 py-2 text-sm font-bold ring-1 ring-ivory/25"><Mic className="h-4 w-4" aria-hidden="true" />{t("vc_again")}</button>}
                </div>
              ) : (
                <>
                  <div className={`relative mt-2 flex h-36 w-36 items-center justify-center rounded-full transition-colors duration-300 ${phase === "listening" ? "bg-leaf/30" : phase === "speaking" ? "bg-gold/25" : phase === "thinking" ? "bg-ivory/15" : "bg-ivory/10"}`}>
                    {(phase === "listening" || phase === "speaking") && <span className="absolute inset-0 animate-ping rounded-full bg-ivory/10" aria-hidden="true" />}
                    <span className={`absolute inset-3 rounded-full ring-4 ${phase === "listening" ? "ring-leaf/60" : phase === "speaking" ? "ring-gold/60" : "ring-ivory/15"}`} aria-hidden="true" />
                    {phase === "speaking" ? <Volume2 className="h-16 w-16 text-gold" aria-hidden="true" /> : phase === "thinking" ? <Sparkles className="h-16 w-16 animate-pulse text-gold" aria-hidden="true" /> : <Mic className={`h-16 w-16 ${phase === "listening" ? "text-ivory" : "text-ivory/80"}`} aria-hidden="true" />}
                  </div>
                  <div className="scale-125"><VoiceWaves active={phase === "listening" || phase === "speaking"} tone={phase === "speaking" ? "speak" : "listen"} /></div>
                  <p className="font-display text-2xl font-extrabold" aria-live="assertive" data-phase={phase}>{phaseLabel}</p>
                  {phase === "listening" && <button type="button" onClick={stopListening} className="rounded-full bg-ivory/15 px-4 py-2 text-sm font-bold ring-1 ring-ivory/25">{t("vc_done_speaking")}</button>}
                  {(phase === "tap" || phase === "idle") && voiceEngine !== "none" && (
                    <button type="button" onClick={tapToTalk} className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-base font-extrabold text-soil shadow-lg transition active:scale-95"><Mic className="h-5 w-5" aria-hidden="true" />{voiceNote === t("vc_no_speech") || phase === "tap" ? t("vc_again") : t("vc_tap_btn")}</button>
                  )}
                  {voiceNote && <p className="max-w-[300px] rounded-xl bg-ivory/10 px-3 py-2 text-[11px] leading-snug text-ivory/80">{voiceNote}</p>}
                </>
              )}
              <div className="mt-auto grid w-full grid-cols-2 gap-3 pt-2">
                <button type="button" onClick={() => setMuted((m) => !m)} aria-pressed={muted} aria-label={muted ? t("vc_unmute") : t("vc_mute")}
                  className={`flex flex-col items-center justify-center gap-1 rounded-3xl py-4 text-sm font-extrabold ring-2 transition active:scale-95 ${muted ? "bg-ivory text-forest ring-ivory" : "bg-ivory/10 text-ivory ring-ivory/30"}`}>
                  {muted ? <VolumeX className="h-8 w-8" aria-hidden="true" /> : <Volume2 className="h-8 w-8" aria-hidden="true" />}{muted ? t("vc_unmute") : t("vc_mute")}
                </button>
                <button type="button" onClick={endCall} aria-label={t("vc_end")} className="flex flex-col items-center justify-center gap-1 rounded-3xl bg-red-600 py-4 text-sm font-extrabold text-white shadow-lg shadow-red-900/40 ring-2 ring-red-400 transition active:scale-95">
                  <PhoneOff className="h-8 w-8" aria-hidden="true" />{t("vc_end")}
                </button>
              </div>
              {!voiceErr && <button type="button" onClick={runDemo} disabled={demoRef.current && phase !== "idle"} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-gold underline-offset-2 hover:underline disabled:opacity-40" data-demo><PlayCircle className="h-4 w-4" aria-hidden="true" />{t("vc_demo_btn")}</button>}
            </div>
          )}
          <div ref={listRef} className={`flex-1 space-y-3 overflow-y-auto p-3 ${voiceOpen ? "hidden" : ""}`} aria-live="polite">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${m.role === "user" ? "rounded-ee-md bg-forest text-ivory" : "rounded-es-md bg-white text-soil ring-1 ring-soil/10"}`}
                  dir={/[؀-ۿ]/.test(m.text) ? "rtl" : "ltr"}>
                  {m.pending && !m.text ? <span className="inline-flex items-center gap-1 text-soil/80"><span className="animate-pulse">●</span>{t("kh_thinking")}</span> : m.text}
                  {m.source === "rules" && <span className="mt-1 block text-[10px] text-soil/80" dir="ltr">{t("kh_offline")}</span>}
                  {m.role === "assistant" && m.text && !m.pending && (synth || ttsRef.current) && (
                    <button type="button" onClick={() => replay(m.text)} className="mt-1 inline-flex items-center gap-1 rounded-full bg-forest/5 px-2 py-0.5 text-[11px] font-bold text-forest hover:bg-forest/10" aria-label={t("vc_replay")}>
                      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />{t("vc_replay")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {messages.length <= 1 && !voiceOpen && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2">
              {chips.map((c) => <button key={c} onClick={() => send(c)} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-forest ring-1 ring-forest/20 hover:bg-forest/5" dir="auto">{c}</button>)}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className={`items-center gap-2 border-t border-soil/10 bg-white p-2.5 ${voiceOpen ? "hidden" : "flex"}`}>
            <label htmlFor="kh-in" className="sr-only">{t("kh_placeholder")}</label>
            <input id="kh-in" ref={inputRef} dir="auto" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("kh_placeholder")} className={inputCls + " py-2"} />
            <button type="button" onClick={() => (voiceOpen ? endCall() : startCall())} className={`rounded-xl p-2.5 ${voiceOpen ? "bg-red-600 text-white" : "bg-gold text-soil"}`} aria-label={voiceOpen ? t("vc_end") : t("vc_start")} title={voiceOpen ? t("vc_end") : t("vc_start")}>{voiceOpen ? <PhoneOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>
            <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-forest p-2.5 text-ivory disabled:opacity-40" aria-label={t("kh_send")}><Send className="h-4 w-4 rtl:-scale-x-100" /></button>
          </form>
        </div>
      )}
    </>
  );
}


/* ------------------------------------------------------------------ */
/* Apni Boli (Name Your Price) live request + 3-tier radius expansion */
/* Owners are simulated (seeded per village + machine) and merged with */
/* real marketplace listings, so the demo is repeatable.               */
/* ------------------------------------------------------------------ */
const DIESEL_BENCHMARK = 360; // PKR/L, national HSD price notified for 13 Nov 2026 (illustrative)
const LONG_TRANSPORT_PER_KM = 60; // PKR per km, flatbed / towing, charged both ways
const VILLAGES = [
  { name: "Raiwind", district: "Lahore Rural" }, { name: "Manga Mandi", district: "Lahore Rural" },
  { name: "Chunian", district: "Kasur" }, { name: "Pattoki", district: "Kasur" },
  { name: "Muridke", district: "Sheikhupura" }, { name: "Ferozewala", district: "Sheikhupura" },
  { name: "Renala Khurd", district: "Okara" }, { name: "Depalpur", district: "Okara" },
  { name: "Jaranwala", district: "Faisalabad" }, { name: "Samundri", district: "Faisalabad" },
  { name: "Chichawatni", district: "Sahiwal" }, { name: "Harappa", district: "Sahiwal" },
];
const TIERS = [
  { n: 1, max: 5, ring: 62, key: "lr_tier1", range: "lr_tier1_r", note: "lr_tier1_t", repKm: 3 },
  { n: 2, max: 25, ring: 118, key: "lr_tier2", range: "lr_tier2_r", note: "lr_tier2_t", repKm: 20 },
  { n: 3, max: 100, ring: 168, key: "lr_tier3", range: "lr_tier3_r", note: "lr_tier3_t", repKm: 80 },
];
const tierOf = (km) => (km <= 5 ? 1 : km <= 25 ? 2 : 3);
const round50 = (n) => Math.round(n / 50) * 50;
const kmToPx = (km) => (km <= 5 ? (km / 5) * 62 : km <= 25 ? 62 + ((km - 5) / 20) * 56 : 118 + ((Math.min(km, 100) - 25) / 75) * 50);
const OWNER_NAMES = ["Ch. Ghulam Rasool", "Malik Asif Iqbal", "Rana Shahbaz", "Mian Arshad", "Sardar Khalid", "Haji Bashir Ahmad", "Ch. Nadeem Akhtar", "Rao Imran", "Mehr Sajjad", "Jutt Farooq", "Malik Zubair", "Syed Anwar Shah", "Ch. Tahir Mehmood", "Bhatti Saleem", "Raja Waqas", "Gondal Javed"];
const MODELS = {
  tractor: ["Massey Ferguson 260", "Fiat NH 480", "Massey Ferguson 375", "New Holland Dabung 85"],
  thresher: ["Wheat Thresher (PTO)", "Multi-crop Thresher", "Maize Sheller", "Rice Thresher"],
  harvester: ["Kubota DC-70 Combine", "Class Combine Harvester", "New Holland TC5.30", "Yanmar Combine"],
  leveler: ["Laser Land Leveler (8 ft)", "Laser Land Leveler (10 ft)"],
  planter: ["Wheat Seed Drill", "Zero-till Drill", "Maize Planter"],
  drone: ["Spray Drone (16 L)", "DJI Agras T20"],
  implement: ["Rotavator", "Disc Harrow", "Cultivator"],
};
const BASE_ASK = { tractor: 2400, thresher: 1900, harvester: 8800, leveler: 3000, planter: 2000, drone: 4000, implement: 2200 };

function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function buildOwnerPool(villageName, category, listings, model, demo = true) {
  const rnd = seededRandom(CUR.id + "|" + villageName + "|" + category);
  const names = CUR.owners || OWNER_NAMES;
  const catModels = CUR.catalog.filter((m) => m.cat === category).map((m) => m.name);
  const models = catModels.length ? catModels : MODELS[category] || [category];
  const baseAsk = askFor(category, BASE_ASK[category] || 2000);
  const pool = [];
  const spec = [[1, 2, 1.2, 4.8], [2, 3, 15, 24.5], [3, 3, 34, 97]];
  let k = 0;
  if (demo) spec.forEach(([tier, count, lo, hi]) => {
    for (let i = 0; i < count; i++) {
      const name = names[(Math.floor(rnd() * names.length) + k) % names.length];
      const distance = Math.round((lo + rnd() * (hi - lo)) * 10) / 10;
      pool.push({
        key: `sim-${tier}-${i}`, name, ownerId: "AS-" + (3000 + Math.floor(rnd() * 6000)), distance, tier,
        angle: rnd() * Math.PI * 2, ask: round50(baseAsk * (0.9 + rnd() * 0.25)), rating: Math.round((4.1 + rnd() * 0.8) * 10) / 10,
        machine: model && rnd() < 0.6 ? model : models[Math.floor(rnd() * models.length)], seed: rnd(), registered: false,
      });
      k++;
    }
  });
  listings.filter((l) => l.available && l.category === category).forEach((l, i) => {
    pool.push({ key: "lst-" + l.id, name: l.ownerName, ownerId: l.ownerId, distance: l.distance, tier: tierOf(l.distance), angle: ((i * 137 + 40) % 360) * (Math.PI / 180), ask: l.rate, rating: l.rating, machine: l.name, seed: (i + 1) / 7, registered: true });
  });
  return pool;
}

function liveTransport(tier, km) {
  if (tier === 1) return km <= 2 ? 0 : Math.min(trMin(), round50(km * trKm()));
  return round50(km * 2 * trLong());
}
function liveQuote({ rate, hours, km, category, rentType, dieselPrice, commissionRate = COMMISSION }) {
  const tier = tierOf(km);
  const h = Math.max(1, Number(hours) || 1);
  const base = rate * h;
  const transport = liveTransport(tier, km);
  const litres = Math.round((DIESEL_L_PER_HR[category] || 0) * h);
  const fuel = Math.round(litres * (Number(dieselPrice) || DIESEL_BENCHMARK));
  const billable = base + transport + (rentType === "wet" ? fuel : 0);
  const commission = Math.round(billable * commissionRate);
  const platformTotal = billable + commission;
  return { tier, hours: h, rate, base, transport, litres, fuel, billable, commission, commissionRate, platformTotal, grand: platformTotal + (rentType === "dry" ? fuel : 0), km };
}

function RadarView({ t, pool, scanTier, scanning, statuses, onPick }) {
  const C = 180;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]" dir="ltr">
      <svg viewBox="0 0 360 360" className="h-full w-full" role="img" aria-label="Radar of nearby machinery owners">
        <defs>
          <radialGradient id="rad-bg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#1d7340" /><stop offset="1" stopColor="#0d3d22" /></radialGradient>
          <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#67A834" stopOpacity="0" /><stop offset="1" stopColor="#67A834" stopOpacity="0.55" /></linearGradient>
        </defs>
        <circle cx={C} cy={C} r="176" fill="url(#rad-bg)" />
        {TIERS.map((tr) => (
          <g key={tr.n}>
            <circle cx={C} cy={C} r={tr.ring} fill={tr.n <= scanTier ? "rgba(103,168,52,0.10)" : "none"} stroke={tr.n === scanTier ? "#E6B325" : "rgba(250,248,238,0.35)"} strokeWidth={tr.n === scanTier ? 2 : 1} strokeDasharray={tr.n === scanTier ? "0" : "4 5"} />
            <text x={C + 4} y={C - tr.ring + 13} fill="rgba(250,248,238,0.8)" fontSize="10" fontWeight="700">T{tr.n} · {tr.max} km</text>
          </g>
        ))}
        <line x1={C - 176} y1={C} x2={C + 176} y2={C} stroke="rgba(250,248,238,0.12)" />
        <line x1={C} y1={C - 176} x2={C} y2={C + 176} stroke="rgba(250,248,238,0.12)" />
        {scanning && (
          <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
            <path d={`M${C},${C} L${C + 176},${C} A176,176 0 0,0 ${C + 176 * Math.cos(-0.7)},${C + 176 * Math.sin(-0.7)} Z`} fill="url(#sweep)" />
          </g>
        )}
        {pool.map((o) => {
          const r = kmToPx(o.distance);
          const x = C + r * Math.cos(o.angle), y = C + r * Math.sin(o.angle);
          const st = statuses[o.key];
          const inRange = o.tier <= scanTier;
          const fill = !inRange ? "rgba(250,248,238,0.25)" : st === "busy" ? "#9ca3af" : st === "offer" ? "#E6B325" : st === "declined" ? "#b91c1c" : "#FAF8EE";
          return (
            <g key={o.key} onClick={() => st === "offer" && onPick(o.key)} style={{ cursor: st === "offer" ? "pointer" : "default" }}>
              {st === "offer" && <circle cx={x} cy={y} r="11" fill="none" stroke="#E6B325" strokeWidth="2" className="radar-ping" style={{ transformOrigin: `${x}px ${y}px` }} />}
              <circle cx={x} cy={y} r={o.registered ? 6.5 : 5.5} fill={fill} stroke="#0d3d22" strokeWidth="1.5" />
              <title>{`${o.name} · ${o.machine} · ${o.distance} km${st === "busy" ? " · busy" : ""}`}</title>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="9" fill="#E6B325" stroke="#FAF8EE" strokeWidth="3" />
        <text x={C} y={C + 24} textAnchor="middle" fill="#FAF8EE" fontSize="11" fontWeight="800">{t("lr_you")}</text>
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-3 text-[11px] font-semibold text-soil/80">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gold" />{t("lr_legend_offer")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white ring-1 ring-soil/30" />{t("lr_legend_scan")}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-400" />{t("lr_legend_busy")}</span>
      </div>
    </div>
  );
}

function CostBreakdown({ t, q, rentType, dieselPrice, category, strong }) {
  const Row = ({ label, value, muted, bold }) => (
    <div className={`flex items-center justify-between gap-3 py-1.5 text-sm ${bold ? "text-base font-extrabold text-forest" : muted ? "text-soil/80" : "text-soil"}`}><span>{label}</span><span className="tabular-nums" dir="ltr">{value}</span></div>
  );
  return (
    <div className={`rounded-2xl p-4 ${strong ? "bg-white ring-2 ring-gold" : "bg-white ring-1 ring-soil/10"}`}>
      {q.tier === 3 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{t("lr_alert3")}
        </p>
      )}
      <p className="mb-1 flex items-center gap-2 text-sm font-bold text-forest"><Calculator className="h-4 w-4" aria-hidden="true" />{t("lr_breakdown")} · T{q.tier} · {q.km} km</p>
      <Row label={`${t("lr_base")} (${pkr(q.rate)} × ${q.hours}h)`} value={pkr(q.base)} />
      <Row label={q.tier === 1 ? `${t("lr_transport_local")} (${q.km} km)` : t("lr_transport").replace("{km}", q.km).replace("{rate}", pkr(trLong()))} value={q.transport ? pkr(q.transport) : t("lr_free")} />
      {rentType === "wet" && <Row label={`${t("lr_fuel_wet")} (~${q.litres} L × ${pkr(dieselPrice)})`} value={pkr(q.fuel)} />}
      <Row label={t("bk_comm").replace("{p}", pctLabel(q.commissionRate))} value={pkr(q.commission)} />
      <div className="my-1 border-t border-dashed border-soil/20" />
      <Row label={t("lr_platform_bill")} value={pkr(q.platformTotal)} />
      {rentType === "dry" && <Row label={`${t("lr_fuel_dry")} (~${q.litres} L × ${pkr(dieselPrice)})`} value={pkr(q.fuel)} muted />}
      <div className="my-1 border-t border-soil/20" />
      <Row label={t("lr_grand")} value={pkr(q.grand)} bold />
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-soil/80"><Fuel className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{DIESEL_L_PER_HR[category] ? t("lr_fuel_est").replace("{l}", DIESEL_L_PER_HR[category]) : t("lr_fuel_battery")}</p>
    </div>
  );
}

function ModeBadge({ t, demo }) {
  return demo
    ? <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-gold/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-soil"><PlayCircle className="h-3 w-3" aria-hidden="true" />{t("mode_badge_demo")}</span>
    : <span className="ms-1 inline-flex items-center gap-1 rounded-full bg-leaf/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-forest"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-leaf" aria-hidden="true" />{t("mode_badge_live")}</span>;
}

/* ------------------------------------------------------------------ */
/* Zero-supply fallback: what we offer when 0 registered owners are    */
/* available. A: widen to 100 km with cost estimates. B: Agri-Agent    */
/* ground team dispatch. C: save demand (pending_demand_requests) so   */
/* the first owner who registers in that district sees waiting farmers.*/
/* ------------------------------------------------------------------ */
const ZsCard = ({ letter, icon: Icon, title, children, tone }) => (
  <div className={`flex flex-col rounded-xl bg-white p-3.5 ring-1 ${tone}`}>
    <p className="flex items-start gap-2 font-bold text-forest">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest text-[11px] font-extrabold text-gold">{letter}</span>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-leafink" aria-hidden="true" /><span>{title}</span>
    </p>
    <div className="mt-2 flex flex-1 flex-col text-sm text-soil/80">{children}</div>
  </div>
);

function ZeroSupplyFallback({ t, dn, session, requireAuth, saveDemand, toast, dieselPrice, request, canExpand, onExpand, pickCategory }) {
  const [cat, setCat] = useState(request.category && request.category !== "all" ? request.category : "tractor");
  const [phone, setPhone] = useState((session && session.phone) || "");
  const [phoneErr, setPhoneErr] = useState("");
  const [doneB, setDoneB] = useState(null);
  const [doneC, setDoneC] = useState(null);
  const category = pickCategory ? cat : request.category;
  const hours = Math.max(1, Number(request.hours) || 4);
  const rate = Number(request.rate) || askFor(category, BASE_ASK[category] || 2000);
  const district = request.district || (request.loc && request.loc.district) || "";
  const place = request.village || (district ? dn(district) : t("lr_you"));
  const machine = t("one_" + category);
  const estimates = [25, 50, 100].map((km) => ({ km, q: liveQuote({ rate, hours, km, category, rentType: request.rentType || "dry", dieselPrice }) }));

  const record = (type) => ({
    id: (type === "agent_dispatch" ? "AD-" : "PD-") + Math.floor(10000 + Math.random() * 89999),
    type, status: "waiting", createdAt: Date.now(), country: request.country || CUR.id,
    category, model: request.model || "", district, province: request.province || (request.loc && request.loc.province) || "",
    village: request.village || "", lat: request.loc ? request.loc.lat : null, lng: request.loc ? request.loc.lng : null,
    hours, date: request.date || addDaysISO(1), rate, rentType: request.rentType || "dry", requestId: request.id || null,
    renterName: session ? session.name : "", renterEmail: session ? session.email : null,
    renterPhone: type === "agent_dispatch" ? phone.replace(/[\s-]/g, "") : (session && session.phone) || "",
    discountPct: type === "notify" ? PRIORITY_DISCOUNT_PCT : 0,
  });
  const sendAgent = () => {
    const digits = phone.replace(/[\s-+]/g, "");
    if (!/^\d{10,13}$/.test(digits)) { setPhoneErr(t("err_phone")); return; }
    requireAuth(() => { const r = record("agent_dispatch"); saveDemand(r); setDoneB(r); toast(t("zs_b_done").replace("{id}", r.id).replace("{phone}", r.renterPhone), { title: t("zs_b") }); });
  };
  const notify = () => requireAuth(() => { const r = record("notify"); saveDemand(r); setDoneC(r); toast(t("zs_c_done").replace("{id}", r.id).replace("{district}", dn(district)), { title: t("zs_c") }); });

  return (
    <div className="animate-[slidein_.3s_ease-out] rounded-2xl border border-leaf/40 bg-gradient-to-br from-leaf/10 via-ivory to-gold/10 p-4" role="region" aria-labelledby="zs-h">
      <p id="zs-h" className="flex items-center gap-2 font-display text-base font-extrabold text-forest"><Handshake className="h-5 w-5 text-gold" aria-hidden="true" />{t("zs_title")}</p>
      <p className="mt-1 text-sm text-soil/80">{t("zs_sub").replace("{place}", place).replace("{machine}", machine)}</p>
      {pickCategory && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-soil">{t("zs_machine")}
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-soil/20 bg-white px-2 py-1 text-sm">
            {catalogCats(CUR.id).map((c) => <option key={c} value={c}>{t("one_" + c)}</option>)}
          </select>
        </label>
      )}
      <div className="mt-3 grid gap-3">
        <ZsCard letter="A" icon={Route} title={t("zs_a")} tone="ring-soil/10">
          <p>{t("zs_a_d")}</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]" dir="ltr">
            {estimates.map(({ km, q }) => (
              <div key={km} className="rounded-lg bg-ivory p-2 ring-1 ring-soil/10">
                <p className="font-bold text-forest">{t("zs_km").replace("{km}", km)}</p>
                <p className="flex justify-between gap-1"><span>{t("zs_transport")}</span><span className="tabular-nums">{pkr(q.transport)}</span></p>
                <p className="flex justify-between gap-1"><span>{t("zs_fuel")}</span><span className="tabular-nums">{q.fuel ? pkr(q.fuel) : "·"}</span></p>
                <p className="mt-0.5 flex justify-between gap-1 border-t border-soil/15 pt-0.5 font-extrabold text-forest"><span>{t("zs_total")}</span><span className="tabular-nums">{pkr(q.grand)}</span></p>
              </div>
            ))}
          </div>
          {onExpand && (canExpand
            ? <button type="button" onClick={onExpand} className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-ivory"><Radar className="h-4 w-4" aria-hidden="true" />{t("zs_a_btn")}</button>
            : <p className="mt-2 text-xs font-semibold text-soil/80">{t("zs_a_done")}</p>)}
        </ZsCard>
        <ZsCard letter="B" icon={Headphones} title={t("zs_b")} tone="ring-gold/50">
          <p>{t("zs_b_d")}</p>
          {doneB ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-leaf/15 p-2.5 text-xs font-semibold text-forest" role="status"><CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t("zs_b_done").replace("{id}", doneB.id).replace("{phone}", doneB.renterPhone)}</p>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-[10rem] flex-1 text-xs font-semibold text-soil">{t("zs_phone")}
                <input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneErr(""); }} placeholder="0300 1234567" dir="ltr" className={inputCls + " mt-1"} aria-invalid={!!phoneErr} />
              </label>
              <button type="button" onClick={sendAgent} className="inline-flex items-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-soil"><PhoneCall className="h-4 w-4" aria-hidden="true" />{t("zs_b_btn")}</button>
              {phoneErr && <p className="w-full text-xs font-semibold text-red-700" role="alert">{phoneErr}</p>}
            </div>
          )}
        </ZsCard>
        <ZsCard letter="C" icon={Megaphone} title={t("zs_c")} tone="ring-leaf/40">
          <p>{t("zs_c_d").replace("{district}", district ? dn(district) : place).replace("{pct}", PRIORITY_DISCOUNT_PCT)}</p>
          {doneC ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-leaf/15 p-2.5 text-xs font-semibold text-forest" role="status"><CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />{t("zs_c_done").replace("{id}", doneC.id).replace("{district}", district ? dn(district) : place)}</p>
          ) : (
            <button type="button" onClick={notify} className="mt-3 inline-flex items-center justify-center gap-2 self-start rounded-xl bg-leafink px-4 py-2.5 text-sm font-bold text-white"><Percent className="h-4 w-4" aria-hidden="true" />{t("zs_c_btn")} · {PRIORITY_DISCOUNT_PCT}%</button>
          )}
        </ZsCard>
      </div>
    </div>
  );
}

function WaitingDemand({ t, dn, demand, session, onList }) {
  const myDistrict = session && session.location && session.location.district;
  const waiting = demand.filter((d) => d.status === "waiting" && (d.country || "PK") === CUR.id).sort((a, b) => b.createdAt - a.createdAt);
  const local = myDistrict ? waiting.filter((d) => d.district === myDistrict) : [];
  const shown = (local.length ? local : waiting).slice(0, 6);
  return (
    <div className="mb-5 rounded-2xl border border-gold/60 bg-gold/10 p-4">
      <h3 className="flex items-center gap-2 font-bold text-forest"><Users className="h-4 w-4 text-gold" aria-hidden="true" />{t("ow_waiting")} <span className="rounded-full bg-gold px-1.5 text-[11px] text-soil">{waiting.length}</span></h3>
      <p className="mt-0.5 text-xs text-soil/80">{t("ow_waiting_sub")}</p>
      {shown.length === 0 ? <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-soil/80">{t("ow_waiting_none")}</p> : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {shown.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-soil/10">
              <span className="min-w-0">
                <span className="block truncate font-bold text-forest"><CategoryIcon category={d.category} className="me-1 inline h-4 w-4" />{t("one_" + d.category)} · {d.village || dn(d.district)}</span>
                <span className="block truncate text-xs text-soil/80" dir="ltr">{d.id} · {fmtDate(d.date)} · {d.hours}h · {pkr(d.rate)}/hr</span>
              </span>
              <span className="shrink-0 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-bold text-soil">{t("dm_" + d.type)}</span>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && onList && <button type="button" onClick={onList} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory"><Plus className="h-4 w-4" aria-hidden="true" />{t("ow_waiting_list")}</button>}
    </div>
  );
}

function LiveRequest({ t, dn, lang, listings, session, requireAuth, createBooking, setTab, toast, dieselPrice, userLoc, liveRequests, saveRequest, country = "PK", setCountry, onVoucher, demoMode = false, saveDemand }) {
  const startLoc = () => {
    const cand = userLoc || (session && session.location);
    return cand && locCountry(cand) === CUR.id ? cand : defaultLocFor(CUR.id);
  };
  const [f, setF] = useState(() => {
    const loc = startLoc();
    return { category: "harvester", model: "", chosen: false, loc, village: locLabel(loc), hours: 4, date: addDaysISO(1), rate: 8000, rentType: "dry", peak: true, smallholder: false };
  });

  const [req, setReq] = useState(null); // posted request snapshot
  const [scanTier, setScanTier] = useState(1);
  const [scanning, setScanning] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [offers, setOffers] = useState([]);
  const [picked, setPicked] = useState(null);
  const [booked, setBooked] = useState(null);
  const [lrPayLater, setLrPayLater] = useState(false);
  const [lrPartner, setLrPartner] = useState(CREDIT_PARTNERS[0]);
  const timers = useRef([]);
  const statusRef = useRef({});
  const stepsRef = useRef(null), formRef = useRef(null), offersRef = useRef(null);
  const scrollTo = (r) => setTimeout(() => { if (r.current) r.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  useEffect(() => { statusRef.current = statuses; }, [statuses]);
  const reqLoc = (req || f).loc || DEFAULT_LOC;
  const village = { name: locLabel(reqLoc), district: reqLoc.district, province: reqLoc.province };
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const pool = useMemo(() => buildOwnerPool((req || f).village, (req || f).category, listings, (req || f).model, demoMode), [req, f.village, f.category, f.model, listings, country, demoMode]);
  const typical = useMemo(() => {
    const near = pool.filter((o) => o.tier <= 2);
    return round50(near.reduce((s, o) => s + o.ask, 0) / Math.max(1, near.length));
  }, [pool]);

  // Step 1: choose the machine type, then name your price
  const chooseMachine = (cat) => {
    setF((s) => ({ ...s, category: cat, model: "", chosen: true, rate: CUR.id === "PK" ? round50(askFor(cat, BASE_ASK[cat] || 2000) * 0.92) : fromLocal(Math.round(toLocal(askFor(cat, BASE_ASK[cat] || 2000) * 0.92))) }));
    scrollTo(stepsRef); // smooth hand-off to Step 2 (Location & offer)
  };
  // Step pills are tabs: 1 Machine type, 2 Location & offer, 3 Live offers
  const goStep = (i) => {
    if (i === 0) {
      if (req) { toast(t("lr_step_locked"), { type: "info" }); scrollTo(formRef); return; }
      setF((s) => ({ ...s, chosen: false })); scrollTo(stepsRef); return;
    }
    if (!f.chosen && !req) setF((s) => ({ ...s, chosen: true }));
    if (i === 1) { scrollTo(formRef); return; }
    scrollTo(offersRef);
    if (!req) setTimeout(() => { const b = document.getElementById("lr-post-btn"); if (b) b.focus({ preventScroll: true }); }, 400);
  };
  // a different country means a different catalog, currency and location
  const firstCountry = useRef(true);
  useEffect(() => {
    if (firstCountry.current) { firstCountry.current = false; return; }
    if (!req) setF((s) => { const loc = startLoc(); return { ...s, chosen: false, model: "", loc, village: locLabel(loc) }; });
  }, [country]); // eslint-disable-line

  const scan = (tierN, request, fresh) => {
    const r = request || req;
    if (!r) return;
    clearTimers();
    setScanTier(tierN); setScanning(true); setPicked(null);
    const pPool = buildOwnerPool(r.village, r.category, listings, r.model, demoMode);
    const prev = fresh ? {} : { ...statusRef.current };
    const inRange = pPool.filter((o) => o.tier <= tierN && !prev[o.key]);
    let delay = 700, latest = 0;
    inRange.sort((a, b) => a.distance - b.distance).forEach((o) => {
      // Live Public Mode: no simulated owners, no simulated busy/counter replies
      const busy = demoMode && r.peak ? o.tier < 3 && !o.registered : false;
      const busyListing = demoMode && r.peak && o.registered && o.tier < 3;
      const at = delay + Math.round(o.seed * 500);
      delay += 420;
      latest = Math.max(latest, at);
      timers.current.push(setTimeout(() => {
        if (busy || busyListing) { setStatuses((s) => ({ ...s, [o.key]: "busy" })); return; }
        let rate, kind;
        if (!demoMode) { rate = o.ask; kind = "listed"; }
        else if (r.rate >= o.ask) { rate = r.rate; kind = "accept"; }
        else if (r.rate >= o.ask * 0.8) { rate = Math.min(o.ask, round50(r.rate + 200)); kind = rate === r.rate ? "accept" : "counter"; }
        else { rate = o.ask; kind = "counter"; }
        setStatuses((s) => ({ ...s, [o.key]: "offer" }));
        setOffers((list) => [...list, { key: o.key, owner: o, rate, kind, at: Date.now() }]);
      }, at));
    });
    timers.current.push(setTimeout(() => setScanning(false), latest + 700));
    if (tierN > (r.tierReached || 1)) {
      saveRequest({ id: r.id, tierReached: tierN });
      setReq((cur) => (cur && cur.id === r.id ? { ...cur, tierReached: tierN } : cur));
    }
  };

  const post = (e) => {
    e.preventDefault();
    requireAuth(() => {
      const r = { ...f, country: CUR.id, id: "RQ-" + Math.floor(10000 + Math.random() * 89999), rate: Math.max(1, Number(f.rate) || 0), hours: Math.min(16, Math.max(1, Number(f.hours) || 1)), createdAt: Date.now(), status: "open", tierReached: 1, renterEmail: session ? session.email : null, renterName: session ? session.name : "", renterPhone: session ? session.phone || "" : "" };
      saveRequest(r);
      setReq(r); setStatuses({}); setOffers([]); setBooked(null);
      statusRef.current = {};
      setTimeout(() => scan(1, r, true), 0);
      const near = buildOwnerPool(r.village, r.category, listings, r.model, demoMode).filter((o) => o.tier === 1).length;
      toast(near ? t("toast_broadcast").replace("{n}", near) : t("toast_broadcast0"), { type: "info", title: t("toast_broadcast_t") });
    });
  };
  const reset = () => { if (req && !booked) saveRequest({ id: req.id, status: "closed" }); clearTimers(); setReq(null); setStatuses({}); setOffers([]); setPicked(null); setBooked(null); setScanning(false); setScanTier(1); };
  const jumpTier = (n) => {
    if (!req) return;
    // re-scan from scratch at the chosen tier so each tier can be demoed with one click
    clearTimers(); setStatuses({}); setOffers([]); setPicked(null); setBooked(null);
    statusRef.current = {};
    setTimeout(() => scan(n, req, true), 0);
  };
  const decline = (key) => { setOffers((l) => l.filter((o) => o.key !== key)); setStatuses((s) => ({ ...s, [key]: "declined" })); if (picked === key) setPicked(null); };

  const myRequests = [...liveRequests].filter((r) => (r.country || "PK") === CUR.id && (!session || !r.renterEmail || r.renterEmail === session.email)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

  // Restore an open request after a page refresh and re-scan the tier it had reached
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const open = [...liveRequests].filter((r) => r.status === "open" && (r.country || "PK") === CUR.id && (!session || !r.renterEmail || r.renterEmail === session.email)).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (open) {
      setReq(open.loc ? open : { ...open, loc: DEFAULT_LOC }); setF((s) => ({ ...s, chosen: true, model: open.model || "", loc: open.loc || s.loc, category: open.category, village: open.village, hours: open.hours, date: open.date, rate: open.rate, rentType: open.rentType, peak: open.peak }));
      statusRef.current = {};
      setTimeout(() => scan(open.tierReached || 1, open, true), 0);
    }
  }, []); // eslint-disable-line

  const offersInTier = offers.filter((o) => o.owner.tier <= scanTier);
  const noMatch = req && !scanning && offersInTier.length === 0;
  const pickedOffer = offers.find((o) => o.key === picked);
  const lrCommission = (req || f).smallholder ? SMALLHOLDER_COMMISSION : COMMISSION;
  const qFor = (o) => liveQuote({ rate: o.rate, hours: req.hours, km: o.owner.distance, category: req.category, rentType: req.rentType, dieselPrice, commissionRate: lrCommission });

  const confirm = () => {
    const o = pickedOffer; if (!o) return;
    const q = qFor(o);
    const listing = { id: "live-" + o.key, name: o.owner.machine, country: CUR.id, category: req.category, district: village.district, ownerId: o.owner.ownerId, rate: o.rate, operator: "included", transport: "optional", distance: o.owner.distance };
    const id = createBooking(listing, {
      date: req.date, hours: q.hours, operator: true, transport: q.transport > 0, payment: lrPayLater ? "paylater" : "easypaisa", smallholder: !!req.smallholder,
      financing: lrPayLater ? (() => { const adv = Math.round(q.platformTotal * ADVANCE_SHARE); const d = new Date(req.date + "T00:00:00"); d.setDate(d.getDate() + 120); return { partner: lrPartner, advance: adv, balance: q.platformTotal - adv, dueDate: d.toISOString().slice(0, 10), status: "pending" }; })() : null,
      renterName: session ? session.name : "Farmer", renterPhone: session ? session.phone : "",
      quote: { hours: q.hours, rate: o.rate, listedRate: o.owner.ask, base: q.base, operator: 0, transport: q.transport, subtotal: q.billable, commission: q.commission, commissionRate: q.commissionRate, total: q.platformTotal, fuel: q.fuel, rentType: req.rentType, tier: q.tier },
      // a real owner confirms from the Owner Portal; only simulated demo owners auto-confirm
      channel: "live", status: o.kind === "listed" ? "sent" : "confirmed",
    }, true);
    clearTimers(); setScanning(false);
    saveRequest({ id: req.id, status: "booked", bookingId: id, agreedRate: o.rate, ownerId: o.owner.ownerId });
    setBooked({ id, owner: o.owner, q });
    toast(t(o.kind === "listed" ? "toast_lr_sent" : "toast_lr_booked").replace("{owner}", o.owner.name), { title: t("toast_booked_t") });
    if (onVoucher) setTimeout(() => onVoucher(id), 350);
  };

  // tier comparison for the one-click demo
  const compare = TIERS.map((tr) => {
    const band = tr.n === 2 ? (o) => o.distance >= 15 && o.distance <= 25 : (o) => o.tier === tr.n;
    const inTier = pool.filter(band).sort((a, b) => a.distance - b.distance);
    const km = inTier.length ? inTier[0].distance : tr.repKm;
    const rate = req ? req.rate : Number(f.rate) || 0;
    return { tr, km, q: liveQuote({ rate, hours: (req || f).hours, km, category: (req || f).category, rentType: (req || f).rentType, dieselPrice, commissionRate: (req || f).smallholder ? SMALLHOLDER_COMMISSION : COMMISSION }) };
  });

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="lr-h">
      <div className="mb-6 overflow-hidden rounded-3xl bg-forest text-ivory">
        <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-ivory/10 px-3 py-1 text-xs font-semibold"><Radar className="h-3.5 w-3.5 text-gold" aria-hidden="true" />{t("ab_name")}</p>
            <h2 id="lr-h" className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">{t("lr_title")}</h2>
            <p className="mt-1 text-sm font-bold text-gold">{t("ab_tag")}</p>
            <p className="mt-2 max-w-2xl text-ivory/80">{t("lr_sub")}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            {TIERS.map((tr) => (
              <div key={tr.n} className="rounded-xl bg-ivory/10 px-3 py-2 ring-1 ring-ivory/15"><p className="font-display text-lg font-extrabold text-gold">T{tr.n}</p><p className="text-ivory/80">{t(tr.range)}</p></div>
            ))}
          </div>
        </div>
      </div>

      {/* Apni Boli steps */}
      <ol ref={stepsRef} className="mb-5 grid scroll-mt-24 grid-cols-3 gap-2" aria-label={t("lr_steps")}>
        {[["1", t("lr_step1")], ["2", t("lr_step2")], ["3", t("lr_step3")]].map(([n, label], i) => {
          const cur = req ? 2 : f.chosen ? 1 : 0;
          return (
            <li key={n} className="min-w-0">
              <button type="button" onClick={() => goStep(i)} aria-current={cur === i ? "step" : undefined}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-xs font-bold ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold active:scale-[0.98] sm:text-sm ${cur === i ? "bg-forest text-ivory ring-forest" : cur > i ? "bg-leaf/15 text-forest ring-leaf/40 hover:bg-leaf/25" : "bg-white text-soil/80 ring-soil/15 hover:text-forest hover:ring-leaf"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${cur === i ? "bg-gold text-soil" : cur > i ? "bg-leafink text-white" : "bg-soil/10"}`}>{cur > i ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : n}</span>
                <span className={`min-w-0 truncate ${cur === i ? "" : "hidden sm:inline"}`}>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {!req && !f.chosen ? (
        <div key="step1" className="animate-[slidein_.3s_ease-out]">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="font-display text-xl font-extrabold text-forest">{t("lr_choose")}</h3>
              <p className="text-sm text-soil/80">{t("lr_choose_sub").replace("{country}", t("country_" + CUR.id))}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {setCountry && <CountrySelect t={t} country={country} setCountry={setCountry} id="country-live" />}
              <p className="text-[11px] text-soil/80">{t("cat_rates_note")}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogCats(CUR.id).map((c) => {
              const ms = CUR.catalog.filter((m) => m.cat === c);
              const lo = Math.min(...ms.map((m) => m.min)), hi = Math.max(...ms.map((m) => m.max));
              return (
                <button type="button" key={c} onClick={() => chooseMachine(c)} data-cat={c}
                  className="group overflow-hidden rounded-2xl border border-soil/10 bg-white text-start shadow-sm ring-forest transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-forest/10 focus-visible:ring-2">
                  <div className="relative aspect-video overflow-hidden">
                    <MachinePhoto category={c} name={ms[0] && ms[0].name} className="h-full w-full transition-transform duration-500 group-hover:scale-105" alt={t("one_" + c)} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden="true" />
                    <span className="absolute bottom-3 end-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/25 backdrop-blur-md" dir="ltr">{ms.map((m) => m.spec.split(" · ")[0]).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(" / ")}</span>
                    <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-forest shadow"><CategoryIcon category={c} className="h-3.5 w-3.5" />{t("cat_" + c)}</span>
                  </div>
                  <div className="space-y-2 p-4">
                    <p className="font-display text-lg font-extrabold text-forest">{t("one_" + c)}</p>
                    <ul className="space-y-1 text-xs text-soil/80">
                      {ms.map((m) => <li key={m.name} className="flex justify-between gap-2" dir="ltr"><span className="truncate font-semibold">{m.name}</span><span className="shrink-0 text-soil/80">{m.spec.split(" · ")[0]}</span></li>)}
                    </ul>
                    <div className="flex items-center justify-between gap-2 border-t border-soil/10 pt-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-soil/80">{t("lr_est_rate")}</span>
                      <span className="font-display text-base font-extrabold text-forest" dir="ltr">{fmtLocal(lo)} to {fmtLocal(hi)}<span className="text-xs font-semibold text-soil/80">/hr</span></span>
                    </div>
                    <span className="flex items-center justify-center gap-1.5 rounded-xl bg-forest px-3 py-2 text-sm font-bold text-ivory group-hover:bg-[#0f4a28]">{t("lr_select")}<ChevronRight className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" /></span>
                  </div>
                </button>
              );
            })}
          </div>
          {myRequests.length > 0 && (
            <div className="mt-6 rounded-2xl border border-soil/10 bg-white p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-soil/80">{t("lr_recent")}</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {myRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-ivory px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate"><span dir="ltr" className="font-mono">{r.id}</span> · {t("one_" + r.category)} · {r.village} · T{r.tierReached || 1}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${r.status === "booked" ? "bg-leaf/15 text-forest" : r.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("rq_" + r.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
      <div key="step2" className="grid animate-[slidein_.3s_ease-out] gap-6 lg:grid-cols-[360px_1fr]">
        {/* request form */}
        <form ref={formRef} onSubmit={post} className="h-fit scroll-mt-24 space-y-4 rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
          <div className="overflow-hidden rounded-xl ring-1 ring-soil/10">
            <div className="relative">
              <MachinePhoto category={f.category} name={f.model || (CUR.catalog.find((m) => m.cat === f.category) || {}).name} className="h-28 w-full" alt={t("one_" + f.category)} />
              <span className="absolute start-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-forest shadow">{t("lr_selected")}</span>
            </div>
            <div className="flex items-center justify-between gap-2 bg-ivory px-3 py-2">
              <p className="min-w-0 truncate font-bold text-forest"><CategoryIcon category={f.category} className="me-1 inline h-4 w-4" />{t("one_" + f.category)}{f.model ? <span className="font-semibold text-soil/80" dir="ltr"> · {f.model}</span> : null}</p>
              {!req && <button type="button" onClick={() => setF((s) => ({ ...s, chosen: false }))} className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-forest ring-1 ring-soil/15">{t("lr_change_machine")}</button>}
            </div>
          </div>
          <fieldset disabled={!!req} className="space-y-4 disabled:opacity-70">
            {CUR.catalog.some((m) => m.cat === f.category) && (
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-soil">{t("lr_pref_model")}</legend>
                <div className="flex flex-wrap gap-1.5">
                  {["", ...CUR.catalog.filter((m) => m.cat === f.category).map((m) => m.name)].map((name) => (
                    <button type="button" key={name || "any"} onClick={() => set("model", name)} aria-pressed={f.model === name}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${f.model === name ? "bg-forest text-ivory ring-forest" : "bg-ivory text-soil ring-soil/15"}`} dir={name ? "ltr" : undefined}>{name || t("lr_any_model")}</button>
                  ))}
                </div>
              </fieldset>
            )}
            <LocationField t={t} lang={lang} id="lr-loc" label={t("lr_village")} value={f.loc} onChange={(loc) => { if (loc) setF((s0) => ({ ...s0, loc, village: locLabel(loc) })); }} />
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("lr_hours")} htmlFor="lr-h2"><input id="lr-h2" type="number" min="1" max="16" value={f.hours} onChange={(e) => set("hours", e.target.value)} className={inputCls} dir="ltr" /></Field>
              <Field label={t("lr_date")} htmlFor="lr-d"><input id="lr-d" type="date" min={todayISO()} value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label={t("lr_rate")} htmlFor="lr-r" hint={t("lr_rate_hint").replace("{r}", pkr(typical))}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => set("rate", Math.max(fromLocal(CUR.nudge), (Number(f.rate) || 0) - fromLocal(CUR.nudge)))} className="rounded-xl border border-soil/20 bg-white p-2.5 text-forest" aria-label="Lower offer"><Minus className="h-4 w-4" /></button>
                <MoneyInput id="lr-r" min={100} step="50" value={f.rate} onChange={(v) => set("rate", v)} className={inputCls + " text-center text-lg font-extrabold text-forest"} />
                <button type="button" onClick={() => set("rate", (Number(f.rate) || 0) + fromLocal(CUR.nudge))} className="rounded-xl border border-soil/20 bg-white p-2.5 text-forest" aria-label="Raise offer"><Plus className="h-4 w-4" /></button>
              </div>
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-soil">{t("lr_rent")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {[["dry", t("lr_dry"), t("lr_dry_d")], ["wet", t("lr_wet"), t("lr_wet_d")]].map(([v, l, d]) => (
                  <button type="button" key={v} onClick={() => set("rentType", v)} aria-pressed={f.rentType === v}
                    className={`rounded-xl p-2.5 text-start ring-1 ${f.rentType === v ? "bg-gold/20 ring-gold" : "bg-ivory ring-soil/15"}`}>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-soil"><Fuel className="h-4 w-4" aria-hidden="true" />{l}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-soil/80">{d}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="rounded-xl bg-ivory p-3 ring-1 ring-soil/10">
              <p className="flex items-center gap-2 text-sm font-bold text-soil"><Fuel className="h-4 w-4" aria-hidden="true" />{(CUR.id === "PK" ? t("lr_diesel_admin") : t("lr_diesel_intl")).replace("{v}", pkr(dieselPrice))}</p>
              <p className="mt-1 text-[11px] leading-snug text-soil/80">{CUR.id === "PK" ? t("lr_diesel_note") : t("lr_diesel_note_intl")}</p>
            </div>
            <Toggle id="lr-peak" label={t("lr_peak")} sub={t("lr_peak_d")} checked={f.peak} onChange={(v) => set("peak", v)} />
            <Toggle id="lr-small" label={t("bk_smallholder")} sub={t("bk_smallholder_sub")} checked={f.smallholder} onChange={(v) => set("smallholder", v)} />
          </fieldset>
          {!req ? (
            <button key="post" id="lr-post-btn" type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory hover:bg-[#0f4a28]">
              <Radar className="h-4 w-4" aria-hidden="true" />{t("lr_post")}
            </button>
          ) : (
            <button key="reset" type="button" onClick={(e) => { e.preventDefault(); reset(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-soil/20 px-4 py-3 text-sm font-bold text-soil hover:bg-ivory">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />{t("lr_new")}
            </button>
          )}
          {myRequests.length > 0 && (
            <div className="border-t border-soil/10 pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-soil/80">{t("lr_recent")}</p>
              <ul className="space-y-1.5">
                {myRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-ivory px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate"><span dir="ltr" className="font-mono">{r.id}</span> · {t("one_" + r.category)} · {r.village} · T{r.tierReached || 1}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${r.status === "booked" ? "bg-leaf/15 text-forest" : r.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("rq_" + r.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>

        {/* radar + offers */}
        <div className="min-w-0 space-y-5">
          <div ref={offersRef} className="scroll-mt-24 rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold text-forest"><Radar className="h-4 w-4" aria-hidden="true" />{t("lr_radar")}<ModeBadge t={t} demo={demoMode} /></h3>
              <div className="flex gap-1.5" role="group" aria-label={t("lr_compare")}>
                {TIERS.map((tr) => (
                  <button key={tr.n} type="button" onClick={() => jumpTier(tr.n)} disabled={!req}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold ring-1 disabled:opacity-40 ${req && scanTier === tr.n ? "bg-forest text-ivory ring-forest" : "bg-ivory text-forest ring-soil/15 hover:ring-leaf"}`}>
                    T{tr.n} · {tr.max} km
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-[minmax(0,380px)_1fr]">
              <div>
                <RadarView t={t} pool={pool} scanTier={req ? scanTier : 0} scanning={scanning} statuses={statuses} onPick={setPicked} />
                <p className="mt-2 text-center text-sm font-semibold text-soil" aria-live="polite">
                  {!req ? t("lr_idle") : scanning ? t("lr_scanning").replace("{tier}", `${t(TIERS[scanTier - 1].key)} (${t(TIERS[scanTier - 1].range)})`) : `${offersInTier.length} ${t("lr_offers_count")}`}
                </p>
              </div>
              <div className="min-w-0">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-forest"><Zap className="h-4 w-4 text-gold" aria-hidden="true" />{t("lr_offers")}</p>
                {!req && <p className="rounded-xl bg-ivory p-4 text-sm text-soil/80">{t("lr_idle_offers")}</p>}
                {req && offersInTier.length === 0 && scanning && <p className="flex items-center gap-2 rounded-xl bg-ivory p-4 text-sm text-soil/80"><Hourglass className="h-4 w-4 animate-pulse text-gold" aria-hidden="true" />{t("lr_waiting")}</p>}
                {noMatch && (!demoMode || scanTier === 3) && (
                  <ZeroSupplyFallback t={t} dn={dn} session={session} requireAuth={requireAuth} saveDemand={saveDemand} toast={toast} dieselPrice={dieselPrice}
                    request={{ ...req, district: village.district, province: village.province }} canExpand={scanTier < 3} onExpand={() => scan(3)} />
                )}
                {noMatch && demoMode && scanTier < 3 && (
                  <div className="rounded-xl border border-gold bg-gold/10 p-4">
                    <p className="flex items-center gap-2 font-bold text-soil"><Siren className="h-4 w-4 text-red-700" aria-hidden="true" />{t("lr_no_match").replace("{tier}", t(TIERS[scanTier - 1].key))}</p>
                    {scanTier < 3 ? (
                      <button type="button" onClick={() => scan(scanTier + 1)} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-ivory">
                        <Route className="h-4 w-4" aria-hidden="true" />{t("lr_expand").replace("{tier}", `${t(TIERS[scanTier].key)} (${t(TIERS[scanTier].range)})`)}
                      </button>
                    ) : <p className="mt-1 text-sm text-soil/80">{t("lr_raise")}</p>}
                  </div>
                )}
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pe-1">
                  {[...offersInTier].sort((a, b) => a.owner.distance - b.owner.distance).map((o) => {
                    const q = qFor(o);
                    return (
                      <li key={o.key} className={`rounded-xl border p-3 transition animate-[slidein_.3s_ease-out] ${picked === o.key ? "border-forest bg-forest/5" : "border-soil/10 bg-ivory/60"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-bold text-forest">{o.owner.name} <span className="font-normal text-soil/80" dir="ltr">· {o.owner.ownerId}</span></p>
                            <p className="truncate text-xs text-soil/80">{o.owner.machine} · <span dir="ltr">{o.owner.distance} km</span> · T{o.owner.tier} · <Star className="inline h-3 w-3 fill-gold text-gold" aria-hidden="true" /> {o.owner.rating} · {t("lr_eta")} ~{Math.max(10, Math.round(o.owner.distance * 2.2))} min</p>
                          </div>
                          <div className="shrink-0 text-end">
                            <p className={`whitespace-nowrap text-[11px] font-bold ${o.kind === "counter" ? "text-soil" : "text-leafink"}`}>{o.kind === "listed" ? t("lr_listed") : o.kind === "accept" ? t("lr_accepts") : `${t("lr_counter")} +${pkr(o.rate - req.rate)}`}</p>
                            <p className="whitespace-nowrap font-display text-lg font-extrabold text-forest" dir="ltr">{pkr(o.rate)}<span className="text-xs font-semibold text-soil/80">/hr</span></p>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-soil/80" dir="ltr">Transport {q.transport ? pkr(q.transport) : t("lr_free")} · {t("lr_grand")}: <b>{pkr(q.grand)}</b></p>
                        <div className="mt-2 flex gap-2">
                          <button type="button" onClick={() => setPicked(o.key)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-bold text-ivory"><Check className="h-4 w-4" aria-hidden="true" />{t("lr_accept")}</button>
                          <button type="button" onClick={() => decline(o.key)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800"><X className="h-4 w-4" aria-hidden="true" />{t("lr_decline")}</button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          {pickedOffer && !booked && (
            <div className="grid gap-4 rounded-2xl border-2 border-forest bg-white p-4 shadow-md md:grid-cols-[1fr_auto] md:items-start">
              <CostBreakdown t={t} q={qFor(pickedOffer)} rentType={req.rentType} dieselPrice={dieselPrice} category={req.category} strong />
              <div className="space-y-2 md:w-56">
                <p className="text-sm text-soil"><b>{pickedOffer.owner.name}</b> · {pickedOffer.owner.machine}</p>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-leaf/10 p-2.5 text-xs font-semibold text-soil ring-1 ring-leaf/30">
                  <input type="checkbox" checked={lrPayLater} onChange={(e) => setLrPayLater(e.target.checked)} className="mt-0.5 h-4 w-4 accent-forest" />
                  <span>{t("pay_paylater")}{lrPayLater && <span className="mt-0.5 block font-normal" dir="ltr">{t("pl_now")}: {pkr(Math.round(qFor(pickedOffer).platformTotal * ADVANCE_SHARE))}</span>}</span>
                </label>
                {lrPayLater && (
                  <div className="flex flex-wrap gap-1">
                    {CREDIT_PARTNERS.map((pt) => <button type="button" key={pt} onClick={() => setLrPartner(pt)} aria-pressed={lrPartner === pt} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${lrPartner === pt ? "bg-forest text-ivory ring-forest" : "bg-white text-soil ring-soil/20"}`}>{pt}</button>)}
                  </div>
                )}
                <button type="button" onClick={confirm} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory"><BadgeCheck className="h-4 w-4" aria-hidden="true" />{t("lr_confirm")}</button>
                <button type="button" onClick={() => setPicked(null)} className="w-full rounded-xl border border-soil/20 px-4 py-2 text-sm font-bold text-soil">{t("cancel")}</button>
              </div>
            </div>
          )}
          {booked && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-leaf/15 p-4 text-forest ring-1 ring-leaf/40">
              <CircleCheck className="h-6 w-6 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-semibold">{t("lr_confirmed")} <span dir="ltr" className="font-mono">{booked.id}</span> · {booked.owner.name} · <span dir="ltr">{pkr(booked.q.grand)}</span></p>
              <button type="button" onClick={() => setTab("bookings")} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">{t("nav_bookings")}</button>
            </div>
          )}

          {/* one-click tier comparison */}
          <div className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <h3 className="mb-1 flex items-center gap-2 font-bold text-forest"><Gauge className="h-4 w-4" aria-hidden="true" />{t("lr_compare")}</h3>
            <p className="mb-3 text-xs text-soil/80">{t("lr_compare_sub")}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {compare.map(({ tr, km, q }) => (
                <div key={tr.n} className={`flex flex-col rounded-xl p-3 ring-1 ${tr.n === 3 ? "bg-red-50/60 ring-red-200" : tr.n === 2 ? "bg-gold/10 ring-gold/40" : "bg-leaf/10 ring-leaf/30"}`}>
                  <p className="font-bold text-forest">{t(tr.key)}</p>
                  <p className="text-xs text-soil/80">{t(tr.range)} · {t(tr.note)}</p>
                  <dl className="mt-2 space-y-1 text-sm text-soil" dir="ltr">
                    <div className="flex justify-between"><dt>{t("lr_nearest")}</dt><dd className="font-semibold">{km} km</dd></div>
                    <div className="flex justify-between"><dt>{t("lr_base")}</dt><dd>{pkr(q.base)}</dd></div>
                    <div className="flex justify-between"><dt>Transport</dt><dd>{q.transport ? pkr(q.transport) : t("lr_free")}</dd></div>
                    <div className="flex justify-between"><dt>Diesel ~{q.litres} L</dt><dd>{pkr(q.fuel)}</dd></div>
                    <div className="flex justify-between"><dt>Fee {pctLabel(q.commissionRate)}</dt><dd>{pkr(q.commission)}</dd></div>
                    <div className="flex justify-between border-t border-soil/15 pt-1 font-extrabold text-forest"><dt>{t("lr_grand")}</dt><dd>{pkr(q.grand)}</dd></div>
                  </dl>
                  <button type="button" onClick={() => (req ? jumpTier(tr.n) : null)} disabled={!req} className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-xs font-bold text-ivory disabled:opacity-40">
                    <Radar className="h-3.5 w-3.5" aria-hidden="true" />{t("lr_test_tier")}
                  </button>
                </div>
              ))}
            </div>
            {!req && <p className="mt-2 text-xs text-soil/80">{t("lr_compare_hint")}</p>}
          </div>
        </div>
      </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Keypad-phone helpline banner (offline access)                       */
/* Sample numbers only: 0800-AGRI-1 and *AGRI# are NOT live. We avoid  */
/* *786#, which is already used by Easypaisa (Telenor) and JazzCash.   */
/* ------------------------------------------------------------------ */
const IVR_SCRIPT = {
  pa: ["ایگری شیئر وچ جی آیاں نوں۔ پنجابی لئی 1 دباؤ، اردو لئی 2۔", "مشین کرائے تے لین لئی 1، اپنی فصل ویچن لئی 2، ایجنٹ نال گل کرن لئی 0 دباؤ۔", "ٹریکٹر لئی 1، تھریشر لئی 2، ہارویسٹر لئی 3 دباؤ۔", "تہاڈی بکنگ دی تصدیق SMS تے آ جاوے گی۔"],
  ur: ["ایگری شیئر میں خوش آمدید۔ پنجابی کے لیے 1، اردو کے لیے 2 دبائیں۔", "مشین کرائے پر لینے کے لیے 1، اپنی فصل بیچنے کے لیے 2، ایجنٹ سے بات کے لیے 0 دبائیں۔", "ٹریکٹر کے لیے 1، تھریشر کے لیے 2، ہارویسٹر کے لیے 3 دبائیں۔", "آپ کی بکنگ کی تصدیق SMS پر آئے گی۔"],
};

function KeypadBanner({ t, setTab }) {
  const [ivr, setIvr] = useState(false);
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6" aria-labelledby="kp-h">
      <div className="overflow-hidden rounded-3xl bg-soil text-ivory shadow-lg">
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold text-soil"><Phone className="h-6 w-6" aria-hidden="true" /></span>
            <div>
              <h2 id="kp-h" className="font-display text-xl font-extrabold sm:text-2xl">{t("kp_title")}</h2>
              <p className="mt-1 max-w-xl text-sm text-ivory/80">{t("kp_sub")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-ivory/10 px-4 py-3 text-center ring-1 ring-ivory/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ivory/80">{t("kp_toll")}</p>
              <p className="font-mono text-xl font-extrabold text-gold" dir="ltr">0800-AGRI-1</p>
            </div>
            <div className="rounded-2xl bg-ivory/10 px-4 py-3 text-center ring-1 ring-ivory/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ivory/80">{t("kp_ussd")}</p>
              <p className="font-mono text-xl font-extrabold text-gold" dir="ltr">*AGRI#</p>
            </div>
            {t("kp_demo") ? <p className="col-span-2 text-center text-[11px] text-ivory/80">{t("kp_demo")}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-ivory/10 px-5 py-3 md:px-6">
          <button type="button" onClick={() => setIvr((v) => !v)} aria-expanded={ivr} className="inline-flex items-center gap-2 rounded-xl bg-ivory/10 px-3 py-2 text-sm font-bold ring-1 ring-ivory/20 hover:bg-ivory/15">
            <Megaphone className="h-4 w-4 text-gold" aria-hidden="true" />{t("kp_ivr")}
          </button>
          <button type="button" onClick={() => setTab("agri-agent")} className="inline-flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-soil">
            <Smartphone className="h-4 w-4" aria-hidden="true" />{t("kp_try")}
          </button>
        </div>
        {ivr && (
          <div className="grid gap-3 border-t border-ivory/10 bg-black/10 p-5 md:grid-cols-2 md:p-6">
            {[["pa", t("kp_ivr_pa")], ["ur", t("kp_ivr_ur")]].map(([k, label]) => (
              <div key={k} className="rounded-2xl bg-ivory/5 p-4 ring-1 ring-ivory/10" dir="rtl" lang={k === "pa" ? "pnb" : "ur"}>
                <p className="mb-2 font-urdu text-sm font-bold text-gold">{label}</p>
                <ol className="space-y-1.5 font-urdu text-sm leading-relaxed text-ivory/90">
                  {IVR_SCRIPT[k].map((line, i) => <li key={i} className="flex gap-2"><span className="font-sans font-bold text-gold">{i + 1}.</span><span>{line}</span></li>)}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Agri-Mandi: name-your-price direct crop selling + closed-loop      */
/* settlement of Harvest Now, Pay Later machinery credit.              */
/* Buyers are simulated sample buyers. Benchmarks per 40 kg mann:      */
/* wheat (Punjab open market, Oct 2026: Rs 4,700 to 5,300) and phutti  */
/* (Punjab, autumn 2026: about Rs 8,600 to 9,200) from news reports;   */
/* paddy and maize are illustrative estimates.                         */
/* ------------------------------------------------------------------ */
const CROPS = {
  wheat: { bench: 5000, sourced: true },
  rice: { bench: 4200, sourced: false },
  maize: { bench: 2900, sourced: false },
  cotton: { bench: 8900, sourced: true },
};
const MANDI_BUYERS = {
  wheat: [["Kasur Roller Flour Mills", "flour"], ["Raiwind Atta Mills", "flour"], ["Sheikhupura Grain Traders", "bulk"], ["Okara Flour & General Mills", "flour"]],
  rice: [["Muridke Rice Mills", "rice"], ["Ferozewala Rice Processing", "rice"], ["Sheikhupura Paddy Exporters", "bulk"], ["Chunian Paddy Buyers", "bulk"]],
  maize: [["Okara Poultry Feed Mills", "feed"], ["Sahiwal Feed Company", "feed"], ["Faisalabad Starch Works", "feed"], ["Depalpur Grain Arhti", "bulk"]],
  cotton: [["Sahiwal Ginning Factory", "ginning"], ["Chichawatni Cotton Ginners", "ginning"], ["Faisalabad Textile Buyers", "bulk"], ["Okara Ginning & Pressing", "ginning"]],
};
const round10 = (n) => Math.round(n / 10) * 10;

function AgriMandi({ t, dn, lang, session, requireAuth, bookings, mandiPosts, saveMandi, settleFinancing, userLoc, setTab, toast }) {
  const startLoc = userLoc || (session && session.location) || DEFAULT_LOC;
  const [f, setF] = useState(() => ({ crop: "wheat", qty: 100, grade: "A", loc: startLoc, village: locLabel(startLoc), rate: CROPS.wheat.bench, wallet: "jazzcash", walletNo: (session && session.phone) || "" }));
  const [post, setPost] = useState(null);
  const [bids, setBids] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const timers = useRef([]);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);
  useEffect(() => { if (!post) setF((s) => ({ ...s, rate: CROPS[s.crop].bench })); }, [f.crop]); // eslint-disable-line

  const mine = (b) => !session || !b.renterEmail || b.renterEmail === session.email;
  const pendingCredit = bookings.filter((b) => mine(b) && b.financing && b.financing.status !== "settled" && !["cancelled", "declined"].includes(b.status))
    .sort((a, b) => (a.financing.dueDate || "").localeCompare(b.financing.dueDate || ""));
  const creditTotal = pendingCredit.reduce((s, b) => s + b.financing.balance, 0);

  const startBidding = (p) => {
    clearTimers(); setBids([]); setScanning(true); setPicked(null);
    const rnd = seededRandom(p.crop + "|" + p.village + "|" + p.qty);
    const bench = CROPS[p.crop].bench * (p.grade === "A" ? 1.02 : 0.97);
    let delay = 800, latest = 0;
    MANDI_BUYERS[p.crop].forEach(([name, type], i) => {
      const bid = round10(bench * (0.94 + rnd() * 0.12));
      const distance = Math.round((6 + rnd() * 50) * 10) / 10;
      const at = delay + Math.round(rnd() * 500);
      delay += 650; latest = Math.max(latest, at);
      timers.current.push(setTimeout(() => {
        if (bid < p.rate * 0.88) return; // too far apart: this buyer passes
        let rate, kind;
        if (bid >= p.rate * 1.015) { rate = bid; kind = "above"; }
        else if (bid >= p.rate) { rate = p.rate; kind = "accept"; }
        else { rate = bid; kind = "counter"; }
        setBids((l) => [...l, { key: `${p.id}-${i}`, name, type, distance, rate, kind }]);
      }, at));
    });
    timers.current.push(setTimeout(() => setScanning(false), latest + 600));
  };

  const submit = (e) => {
    e.preventDefault();
    requireAuth(() => {
      const p = { ...f, id: "AM-" + Math.floor(10000 + Math.random() * 89999), qty: Math.max(1, Number(f.qty) || 1), rate: Math.max(100, Number(f.rate) || 0), status: "open", createdAt: Date.now(), sellerEmail: session ? session.email : null, sellerName: session ? session.name : "" };
      saveMandi(p); setPost(p); setReceipt(null);
      setTimeout(() => startBidding(p), 0);
    });
  };
  const reset = () => { if (post && post.status === "open" && !receipt) saveMandi({ id: post.id, status: "closed" }); clearTimers(); setPost(null); setBids([]); setPicked(null); setReceipt(null); setScanning(false); };
  const pickedBid = bids.find((b) => b.key === picked);

  // settle oldest credits first, only those the sale proceeds can fully cover
  const plan = (gross) => {
    let left = gross; const ids = []; let settled = 0;
    pendingCredit.forEach((b) => { if (b.financing.balance <= left) { left -= b.financing.balance; settled += b.financing.balance; ids.push(b.id); } });
    return { ids, settled, net: gross - settled, unsettled: creditTotal - settled };
  };
  const confirmSale = () => {
    if (!pickedBid || !post) return;
    const gross = pickedBid.rate * post.qty;
    const pl = plan(gross);
    settleFinancing(pl.ids, post.id);
    const rec = { saleId: post.id, buyer: pickedBid.name, rate: pickedBid.rate, qty: post.qty, gross, ...pl, wallet: post.wallet, walletNo: post.walletNo };
    saveMandi({ id: post.id, status: "sold", soldTo: pickedBid.name, soldRate: pickedBid.rate, gross, creditSettled: pl.settled, net: pl.net, settledBookings: pl.ids, soldAt: Date.now() });
    clearTimers(); setScanning(false); setReceipt(rec);
    toast(t("toast_sold").replace("{net}", pkr(pl.net)));
  };
  const maskWallet = (n) => (n && n.length >= 4 ? "•••• " + n.slice(-4) : "••••");
  const myPosts = [...mandiPosts].filter((p) => !session || !p.sellerEmail || p.sellerEmail === session.email).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const typeLabel = (ty) => t("am_type_" + ty);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="am-h">
      <div className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#7a4e2d] to-soil text-ivory">
        <div className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-ivory/10 px-3 py-1 text-xs font-semibold"><Wheat className="h-3.5 w-3.5 text-gold" aria-hidden="true" />{t("nav_mandi")}</p>
            <h2 id="am-h" className="mt-3 font-display text-2xl font-extrabold sm:text-3xl">{t("am_title")}</h2>
            <p className="mt-2 max-w-2xl text-ivory/80">{t("am_sub")}</p>
          </div>
          <div className="rounded-2xl bg-ivory/10 p-4 ring-1 ring-ivory/20">
            <p className="text-xs text-ivory/80">{t("am_credit")}</p>
            <p className="font-display text-2xl font-extrabold text-gold" dir="ltr">{pkr(creditTotal)}</p>
            <p className="text-[11px] text-ivory/80">{pendingCredit.length} {t("am_credit_n")}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border-2 border-leaf/50 bg-leaf/10 p-4">
        <p className="flex flex-wrap items-center gap-2 font-bold text-forest">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-forest px-3 py-1 text-xs text-gold"><Repeat className="h-3.5 w-3.5" aria-hidden="true" />{t("am_closed_loop")}</span>
          {t("am_closed_title")}
        </p>
        <ol className="mt-3 grid gap-2 text-sm text-soil sm:grid-cols-2 lg:grid-cols-4">
          {["am_loop1", "am_loop2", "am_loop3", "am_loop4"].map((k, i) => (
            <li key={k} className="flex items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-soil/10"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold text-xs font-extrabold text-soil">{i + 1}</span>{t(k)}</li>
          ))}
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <form onSubmit={submit} className="h-fit space-y-4 rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
          <fieldset disabled={!!post} className="space-y-4 disabled:opacity-70">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-soil">{t("am_crop")}</legend>
              <div className="grid grid-cols-4 gap-2">
                {Object.keys(CROPS).map((c) => (
                  <button type="button" key={c} onClick={() => set("crop", c)} aria-pressed={f.crop === c}
                    className={`rounded-xl px-1 py-2.5 text-xs font-bold ring-1 ${f.crop === c ? "bg-forest text-ivory ring-forest" : "bg-ivory text-soil ring-soil/15"}`}>{t("crop_" + c)}</button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("am_qty")} htmlFor="am-q"><input id="am-q" type="number" min="1" value={f.qty} onChange={(e) => set("qty", e.target.value)} className={inputCls} dir="ltr" /></Field>
              <Field label={t("am_grade")} htmlFor="am-g">
                <select id="am-g" value={f.grade} onChange={(e) => set("grade", e.target.value)} className={inputCls}><option value="A">{t("am_grade_a")}</option><option value="B">{t("am_grade_b")}</option></select>
              </Field>
            </div>
            <LocationField t={t} lang={lang} id="am-loc" label={t("lr_village")} value={f.loc} onChange={(loc) => { if (loc) setF((s0) => ({ ...s0, loc, village: locLabel(loc) })); }} />
            <Field label={t("am_rate")} htmlFor="am-r" hint={(CROPS[f.crop].sourced ? t("am_bench_src") : t("am_bench_est")).replace("{r}", pkr(CROPS[f.crop].bench))}>
              <MoneyInput id="am-r" min={100} step="10" value={f.rate} onChange={(v) => set("rate", v)} className={inputCls + " text-center text-lg font-extrabold text-forest"} />
            </Field>
            <p className="rounded-xl bg-ivory p-2.5 text-center text-sm font-semibold text-soil" dir="ltr">{t("am_expected_total")}: {pkr((Number(f.qty) || 0) * (Number(f.rate) || 0))}</p>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-soil">{t("am_wallet")}</legend>
              <div className="grid grid-cols-2 gap-2">
                {[["jazzcash", "JazzCash"], ["easypaisa", "EasyPaisa"]].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => set("wallet", v)} aria-pressed={f.wallet === v} className={`rounded-xl py-2 text-sm font-bold ring-1 ${f.wallet === v ? "bg-gold/20 text-soil ring-gold" : "bg-ivory text-soil ring-soil/15"}`}>{l}</button>
                ))}
              </div>
              <label htmlFor="am-w" className="sr-only">{t("am_wallet_no")}</label>
              <input id="am-w" inputMode="tel" dir="ltr" placeholder="03XX XXXXXXX" value={f.walletNo} onChange={(e) => set("walletNo", e.target.value)} className={inputCls + " mt-2"} />
            </fieldset>
          </fieldset>
          {!post ? (
            <button key="post" type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory"><Megaphone className="h-4 w-4" aria-hidden="true" />{t("am_post")}</button>
          ) : (
            <button key="reset" type="button" onClick={(e) => { e.preventDefault(); reset(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-soil/20 px-4 py-3 text-sm font-bold text-soil"><RotateCcw className="h-4 w-4" aria-hidden="true" />{t("am_new")}</button>
          )}
          {myPosts.length > 0 && (
            <div className="border-t border-soil/10 pt-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-soil/80">{t("am_recent")}</p>
              <ul className="space-y-1.5">
                {myPosts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-ivory px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate"><span dir="ltr" className="font-mono">{p.id}</span> · {t("crop_" + p.crop)} · {p.qty} {t("am_mann")}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 font-bold ${p.status === "sold" ? "bg-leaf/15 text-forest" : p.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("am_st_" + p.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>

        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold text-forest"><Zap className="h-4 w-4 text-gold" aria-hidden="true" />{t("am_bids")}</h3>
              {post && <span className="text-xs font-semibold text-soil/80" aria-live="polite">{scanning ? t("am_waiting") : `${bids.length} ${t("am_bids_n")}`}</span>}
            </div>
            {!post && <p className="rounded-xl bg-ivory p-4 text-sm text-soil/80">{t("am_idle")}</p>}
            {post && !scanning && bids.length === 0 && <p className="rounded-xl bg-gold/10 p-4 text-sm text-soil">{t("am_no_bids")}</p>}
            <ul className="grid gap-2 md:grid-cols-2">
              {[...bids].sort((a, b) => b.rate - a.rate).map((b) => (
                <li key={b.key} className={`rounded-xl border p-3 animate-[slidein_.3s_ease-out] ${picked === b.key ? "border-forest bg-forest/5" : "border-soil/10 bg-ivory/60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-forest">{b.name}</p>
                      <p className="text-xs text-soil/80">{typeLabel(b.type)} · <span dir="ltr">{b.distance} km</span> · {t("am_sample")}</p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={`whitespace-nowrap text-[11px] font-bold ${b.kind === "counter" ? "text-soil" : "text-leafink"}`}>{b.kind === "above" ? t("am_above") : b.kind === "accept" ? t("lr_accepts") : t("lr_counter")}</p>
                      <p className="whitespace-nowrap font-display text-lg font-extrabold text-forest" dir="ltr">{pkr(b.rate)}<span className="text-xs font-semibold text-soil/80">/{t("am_mann")}</span></p>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-soil/80" dir="ltr">{post.qty} × {pkr(b.rate)} = <b>{pkr(post.qty * b.rate)}</b> · {t("am_pickup")}</p>
                  {!receipt && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => setPicked(b.key)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-bold text-ivory"><Check className="h-4 w-4" aria-hidden="true" />{t("lr_accept")}</button>
                      <button type="button" onClick={() => { setBids((l) => l.filter((x) => x.key !== b.key)); if (picked === b.key) setPicked(null); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800"><X className="h-4 w-4" aria-hidden="true" />{t("lr_decline")}</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {pickedBid && !receipt && (() => {
            const gross = pickedBid.rate * post.qty; const pl = plan(gross);
            return (
              <div className="grid gap-4 rounded-2xl border-2 border-forest bg-white p-4 shadow-md md:grid-cols-[1fr_auto] md:items-start">
                <div className="rounded-2xl bg-white p-4 ring-2 ring-gold">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-forest"><Calculator className="h-4 w-4" aria-hidden="true" />{t("am_settlement")}
                    <span className="inline-flex items-center gap-1 rounded-full bg-forest px-2 py-0.5 text-[11px] text-gold"><Repeat className="h-3 w-3" aria-hidden="true" />{t("am_closed_loop")}</span></p>
                  <div className="space-y-1.5 text-sm text-soil" dir="ltr">
                    <div className="flex justify-between gap-3"><span>{t("am_gross")} ({post.qty} × {pkr(pickedBid.rate)})</span><b>{pkr(gross)}</b></div>
                    <div className="flex justify-between gap-3"><span>{t("am_minus_credit")} ({pl.ids.length})</span><b className="text-red-800">− {pkr(pl.settled)}</b></div>
                    {pl.unsettled > 0 && <p className="text-xs text-soil/80">{t("am_unsettled").replace("{v}", pkr(pl.unsettled))}</p>}
                    <div className="flex justify-between gap-3 border-t border-soil/20 pt-1.5 text-base font-extrabold text-forest"><span>{t("am_net")}</span><span>{pkr(pl.net)}</span></div>
                    <p className="text-xs text-soil/80">{t("am_to_wallet").replace("{w}", post.wallet === "jazzcash" ? "JazzCash" : "EasyPaisa").replace("{n}", maskWallet(post.walletNo))}</p>
                  </div>
                </div>
                <div className="space-y-2 md:w-56">
                  <p className="text-sm text-soil"><b>{pickedBid.name}</b></p>
                  <button type="button" onClick={confirmSale} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory"><BadgeCheck className="h-4 w-4" aria-hidden="true" />{t("am_confirm")}</button>
                  <button type="button" onClick={() => setPicked(null)} className="w-full rounded-xl border border-soil/20 px-4 py-2 text-sm font-bold text-soil">{t("cancel")}</button>
                </div>
              </div>
            );
          })()}

          {receipt && (
            <div className="rounded-2xl bg-leaf/15 p-5 ring-1 ring-leaf/40">
              <p className="flex items-center gap-2 font-bold text-forest"><CircleCheck className="h-6 w-6" aria-hidden="true" />{t("am_done")}</p>
              <dl className="mt-3 grid gap-2 text-sm text-soil sm:grid-cols-2" dir="ltr">
                <div className="rounded-xl bg-white p-3"><dt className="text-xs text-soil/80">{t("am_sold_to")}</dt><dd className="font-bold">{receipt.buyer} · {receipt.qty} {t("am_mann")} × {pkr(receipt.rate)}</dd></div>
                <div className="rounded-xl bg-white p-3"><dt className="text-xs text-soil/80">{t("am_gross")}</dt><dd className="font-bold">{pkr(receipt.gross)}</dd></div>
                <div className="rounded-xl bg-white p-3"><dt className="text-xs text-soil/80">{t("am_minus_credit")}</dt><dd className="font-bold">{pkr(receipt.settled)} ({receipt.ids.length})</dd></div>
                <div className="rounded-xl bg-forest p-3 text-ivory"><dt className="text-xs text-ivory/80">{t("am_net")}</dt><dd className="font-display text-xl font-extrabold text-gold">{pkr(receipt.net)}</dd></div>
              </dl>
              <p className="mt-3 text-xs text-soil/80">{t("am_to_wallet").replace("{w}", receipt.wallet === "jazzcash" ? "JazzCash" : "EasyPaisa").replace("{n}", maskWallet(receipt.walletNo))} {t("am_demo_note")}</p>
              {receipt.ids.length > 0 && <button type="button" onClick={() => setTab("bookings")} className="mt-3 rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">{t("nav_bookings")}</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Admin Panel: listing verification, bookings & commission ledger,    */
/* platform settings (diesel benchmark, pilot districts), request log  */
/* Admin access: founder email (plus team emails the founder adds) AND a  */
/* verified Firebase email AND the admin password whose salted SHA-256   */
/* hash lives in Firestore admin_settings/security. firestore.rules     */
/* enforce the same email checks on the server.                          */
/* It is NOT real security. Before a real pilot, move admin actions    */
/* behind Firebase Auth + Firestore security rules (see firebaseConfig).*/
/* ------------------------------------------------------------------ */
const FOUNDER_EMAIL = "00talhashoaib786@gmail.com";
const ADMIN_EMAILS = [FOUNDER_EMAIL];
const ADMIN_MIN_PIN = 4;
const normEmail = (e) => String(e || "").trim().toLowerCase();
const randomSalt = () => { try { return Array.from(window.crypto.getRandomValues(new Uint8Array(16))).map((x) => x.toString(16).padStart(2, "0")).join(""); } catch (e) { return String(Date.now()) + Math.random().toString(16).slice(2); } };
async function sha256Hex(text) {
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
const adminHash = (salt, password) => sha256Hex(`agrishare-admin:${salt}:${password}`);
const ACTIVE_STATUSES = ["confirmed", "completed", "feedback"];

// "0300 1234567" / "+92 300..." -> "923001234567" for wa.me links (Pakistani 03xx numbers get the 92 code)
const waDigits = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (/^03\d{9}$/.test(d)) d = "92" + d.slice(1);
  else if (/^3\d{9}$/.test(d)) d = "92" + d;
  return d.length >= 10 ? d : "";
};
const fmtStamp = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "·");

function ContactButtons({ t, phone, name }) {
  const wa = waDigits(phone);
  if (!phone || !wa) return <span className="text-xs font-semibold text-soil/80">{t("ct_none")}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-xs font-semibold text-soil" dir="ltr">{phone}</span>
      <a href={`tel:+${wa}`} className="inline-flex items-center gap-1 rounded-lg bg-forest px-2 py-1 text-[11px] font-bold text-ivory" aria-label={`${t("ct_call")} ${name || phone}`}><Phone className="h-3.5 w-3.5" aria-hidden="true" />{t("ct_call")}</a>
      <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#1E7A45] px-2 py-1 text-[11px] font-bold text-white" aria-label={`${t("ct_wa")} ${name || phone}`}><MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />{t("ct_wa")}</a>
    </span>
  );
}

function ListingStatusPill({ status, t }) {
  const s = status || "approved";
  const cls = s === "pending" ? "bg-gold/25 text-soil" : s === "rejected" ? "bg-red-100 text-red-800" : "bg-leaf/15 text-forest";
  return <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{t("ls_" + s)}</span>;
}

function CloudBadge({ t, cloud, detail }) {
  if (!cloud) return null;
  const o = cloud.overall;
  const tone = o === "live" ? "bg-leaf/15 text-forest ring-leaf/40" : o === "connecting" ? "bg-ivory text-soil ring-soil/20" : o === "partial" ? "bg-gold/20 text-soil ring-gold/50" : o === "nodb" || o === "denied" ? "bg-red-50 text-red-800 ring-red-200" : "bg-soil/10 text-soil ring-soil/20";
  const codes = cloud.codes || {};
  const lines = Object.entries(cloud.status).map(([k, v]) => `${k}: ${v}${codes[k] ? ` (${codes[k]})` : ""}`);
  const problems = Object.entries(cloud.status).filter(([, v]) => v !== "live" && v !== "connecting");
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <p className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ${tone}`} role="status" title={`${t("cloud_detail").replace("{db}", cloud.databaseId || "")}\n${lines.join("\n")}`}>
        <span className={`h-2 w-2 rounded-full ${o === "live" ? "bg-leaf animate-pulse" : o === "partial" ? "bg-gold" : o === "nodb" || o === "denied" ? "bg-red-600" : "bg-soil/40"}`} aria-hidden="true" />
        {t("cloud_" + o)}
      </p>
      {detail && problems.length > 0 && (
        <span className="max-w-xs text-end text-[11px] leading-snug text-soil/80" dir="ltr">
          {t("cloud_detail").replace("{db}", cloud.databaseId || "")} {problems.map(([k, v]) => `${k}: ${v}${codes[k] ? ` (${codes[k]})` : ""}`).join(" · ")}
        </span>
      )}
    </span>
  );
}

function AdminPanel(props) {
  const { t, accounts, openAuth } = props;
  const u = accounts.fbUser;
  // wait for Firebase Auth to report the user, otherwise a signed-in founder briefly sees 403
  if (accounts.mode === "loading" || (accounts.mode === "firebase" && !accounts.fbReady)) return <section className="mx-auto max-w-md px-4 py-14 text-center text-sm text-soil/80"><Hourglass className="me-1 inline h-4 w-4 animate-pulse" aria-hidden="true" /></section>;
  if (!accounts.isAdmin || !u) return <Admin403 t={t} accounts={accounts} openAuth={openAuth} />;
  if (!u.emailVerified) return <AdminVerifyEmail t={t} accounts={accounts} toast={props.toast} />;
  return <AdminVault key={u.uid} {...props} />;
}

function AdminShell({ icon: Icon = Lock, title, sub, children }) {
  return (
    <section className="mx-auto flex max-w-md flex-col px-4 py-14 sm:px-6">
      <div className="rounded-3xl border border-soil/10 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest text-gold"><Icon className="h-7 w-7" aria-hidden="true" /></span>
        <h2 className="mt-4 font-display text-2xl font-extrabold text-forest">{title}</h2>
        {sub && <p className="mt-1 text-sm text-soil/80">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

function Admin403({ t, accounts, openAuth }) {
  const u = accounts.fbUser, sess = accounts.session;
  // tell the visitor exactly why access is refused
  const why = u
    ? (u.email ? t("ad403_other").replace("{email}", u.email) : t("ad403_phone"))
    : sess ? (sess.email ? t("ad403_local").replace("{email}", sess.email) : t("ad403_phone")) : "";
  const reSignIn = () => { accounts.signOut(); if (openAuth) setTimeout(() => openAuth("signin"), 0); };
  return (
    <AdminShell icon={Ban} title={t("ad403_title")} sub={t("ad403_sub")}>
      {why && <p className="mt-4 rounded-xl bg-gold/15 p-3 text-start text-xs font-semibold text-soil">{why}</p>}
      <div className="mt-5 flex flex-col gap-2">
        {!u && !sess && openAuth && <button type="button" onClick={() => openAuth("signin")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory"><LogIn className="h-4 w-4" aria-hidden="true" />{t("ad403_signin")}</button>}
        {(u || sess) && openAuth && <button type="button" onClick={reSignIn} className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory"><LogIn className="h-4 w-4" aria-hidden="true" />{t("ad403_fix")}</button>}
        <a href="#marketplace" className="rounded-xl border border-soil/20 px-4 py-2.5 text-sm font-bold text-soil">{t("ad403_home")}</a>
      </div>
    </AdminShell>
  );
}

function AdminVerifyEmail({ t, accounts, toast }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const send = async () => {
    setBusy(true); setMsg("");
    try { await fbSendVerification(); setSent(true); } catch (e) { setMsg(t("adp_save_err")); }
    setBusy(false);
  };
  const check = async () => {
    setBusy(true); setMsg("");
    try { const u = await accounts.refreshFbUser(); if (!u || !u.emailVerified) setMsg(t("adv_still")); } catch (e) { setMsg(t("adp_load_err")); }
    setBusy(false);
  };
  // reload the Firebase user on open and whenever the founder comes back from the verification link
  useEffect(() => {
    const quiet = () => { accounts.refreshFbUser().catch(() => {}); };
    quiet();
    window.addEventListener("focus", quiet);
    return () => window.removeEventListener("focus", quiet);
  }, []); // eslint-disable-line
  return (
    <AdminShell icon={Mail} title={t("adv_title")} sub={t("adv_sub").replace("{email}", accounts.fbUser.email)}>
      {sent && <p className="mt-4 rounded-xl bg-leaf/15 p-3 text-sm font-semibold text-forest" role="status">{t("adv_sent")}</p>}
      {msg && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{msg}</p>}
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={send} className="rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory disabled:opacity-50">{t("adv_send")}</button>
        <button type="button" disabled={busy} onClick={check} className="rounded-xl border border-soil/20 px-4 py-2.5 text-sm font-bold text-soil disabled:opacity-50">{t("adv_check")}</button>
      </div>
    </AdminShell>
  );
}

const unlockKey = (uid, sec) => `${uid}:${sec && sec.hash ? sec.hash.slice(0, 16) : ""}`;
// admin_settings/security holds an OPTIONAL secondary PIN, synced only through Firestore.
// Off by default: a verified founder / team-admin email opens the panel on any device.
// { pinEnabled: true, hash, salt } turns the PIN on; anything else means no PIN.
const pinOn = (d) => !!(d && d.pinEnabled === true && typeof d.hash === "string" && typeof d.salt === "string");
const TIMED_OUT = "__timeout__";
// returns "ok" (saved in Firestore), "queued" (offline: Firestore sends it when back online) or "denied"
async function saveAdminSecurity(v) {
  try {
    const r = await withTimeout(writeDoc(COL.settings, "security", v), 7000, TIMED_OUT);
    return r === TIMED_OUT ? "queued" : "ok";
  } catch (e) {
    console.warn("[Agri-Share] Admin security not saved:", e && e.code);
    return e && e.code === "permission-denied" ? "denied" : "queued";
  }
}
// Read admin_settings/security. Missing doc, unreachable Firestore or refused read all mean "no PIN":
// the verified admin email is the real gate, so the founder is never locked out on a new device.
async function loadAdminSecurity() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await withTimeout(readDoc(COL.settings, "security"), 6000, TIMED_OUT);
      if (d !== TIMED_OUT) return d || null;
      return null;
    } catch (e) {
      console.warn("[Agri-Share] Admin security read failed:", e && e.code);
      // a token issued before the email was verified is refused by the rules: refresh it and retry once
      if (attempt === 0) { try { await fbRefreshUser(); } catch (er) { /* offline */ } }
    }
  }
  return null;
}

function AdminVault(props) {
  const { t, accounts } = props;
  const u = accounts.fbUser;
  const [sec, setSec] = useState(undefined); // undefined while loading, then the security doc or null
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fails = useRef(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (lockUntil <= Date.now()) return undefined; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [lockUntil]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await withTimeout(accounts.refreshFbUser(), 5000, null); } catch (e) { /* offline: keep the cached user */ }
      const d = await loadAdminSecurity();
      if (!alive) return;
      setSec(d);
      try { if (pinOn(d) && window.sessionStorage.getItem("agrishare.admin.unlock") === unlockKey(u.uid, d)) setUnlocked(true); } catch (e) { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [u.uid]); // eslint-disable-line

  const remember = (v) => { try { window.sessionStorage.setItem("agrishare.admin.unlock", unlockKey(u.uid, v)); } catch (e) { /* ignore */ } };
  const lock = () => { setUnlocked(false); setPin(""); try { window.sessionStorage.removeItem("agrishare.admin.unlock"); } catch (e) { /* ignore */ } };
  const updateSec = (v) => { setSec(v); if (pinOn(v)) { remember(v); setUnlocked(true); } };

  const verify = async (e) => {
    e.preventDefault(); setErr("");
    if (lockUntil > Date.now()) return;
    setBusy(true);
    const ok = (await adminHash(sec.salt, pin)) === sec.hash;
    setBusy(false); setPin("");
    if (ok) { fails.current = 0; remember(sec); setUnlocked(true); return; }
    fails.current += 1;
    if (fails.current >= 5) { fails.current = 0; setLockUntil(Date.now() + 60000); }
    setErr(t("adp_wrong"));
  };

  if (sec === undefined) return <AdminShell icon={ShieldCheck} title={t("adp_opening")}><p className="mt-4 text-sm text-soil/80"><Hourglass className="me-1 inline h-4 w-4 animate-pulse" aria-hidden="true" /></p></AdminShell>;
  const needPin = pinOn(sec) && !unlocked;
  if (!needPin) return <AdminConsole {...props} onLock={pinOn(sec) ? lock : null} sec={sec} setSec={updateSec} />;

  const wait = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
  return (
    <AdminShell icon={Lock} title={t("adp_enter_title")} sub={t("adp_enter_sub").replace("{email}", u.email)}>
      <form onSubmit={verify} noValidate>
        <div className="mt-4 text-start">
          <label htmlFor="adp-pin" className="text-sm font-semibold text-soil">{t("adp_pass")}</label>
          <input id="adp-pin" type="password" autoComplete="current-password" value={pin} onChange={(e) => { setPin(e.target.value); setErr(""); }} className={inputCls + " mt-1"} dir="ltr" />
        </div>
        {(err || wait > 0) && <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{wait > 0 ? t("adp_locked").replace("{s}", wait) : err}</p>}
        <button type="submit" disabled={busy || wait > 0 || !pin} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory disabled:opacity-50"><KeyRound className="h-4 w-4" aria-hidden="true" />{t("adp_unlock")}</button>
      </form>
    </AdminShell>
  );
}

function AdminSecurity({ t, accounts, sec, setSec, toast }) {
  const u = accounts.fbUser;
  const founder = accounts.isFounder;
  const enabled = pinOn(sec);
  const [cur, setCur] = useState(""), [nw, setNw] = useState(""), [nw2, setNw2] = useState("");
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(""), [teamErr, setTeamErr] = useState("");
  const clear = () => { setCur(""); setNw(""); setNw2(""); setErr(""); };
  const report = (res, okKey) => {
    if (res === "denied") { setErr(t("adp_cloud_denied")); return false; }
    toast(res === "ok" ? t(okKey) : t("adp_cloud_queued"), { type: res === "ok" ? "success" : "warn", ms: res === "ok" ? 4200 : 8000 });
    return true;
  };
  const checkCurrent = async () => { if (enabled && (await adminHash(sec.salt, cur)) !== sec.hash) { setErr(t("adp_wrong")); return false; } return true; };
  const savePin = async (e) => {
    e.preventDefault(); setErr("");
    if (!(await checkCurrent())) return;
    if (nw.length < ADMIN_MIN_PIN) { setErr(t("adp_short").replace("{n}", ADMIN_MIN_PIN)); return; }
    if (nw !== nw2) { setErr(t("adp_mismatch")); return; }
    setBusy(true);
    const salt = randomSalt();
    const v = { pinEnabled: true, hash: await adminHash(salt, nw), salt, algo: "sha256", updatedAt: Date.now(), updatedBy: u.email };
    const res = await saveAdminSecurity(v);
    setBusy(false);
    if (report(res, enabled ? "ads_changed" : "ads_pin_on")) { setSec(v); clear(); }
  };
  const turnOff = async () => {
    setErr("");
    if (!(await checkCurrent())) return;
    setBusy(true);
    const v = { pinEnabled: false, updatedAt: Date.now(), updatedBy: u.email };
    const res = await saveAdminSecurity(v);
    setBusy(false);
    if (report(res, "ads_pin_off")) { setSec(v); clear(); }
  };
  const saveTeam = async (emails) => {
    setTeamErr("");
    try { await writeDoc(COL.settings, "team", { emails, updatedAt: Date.now(), updatedBy: u.email }); toast(t("ads_team_saved")); return true; }
    catch (e) { setTeamErr(t("adp_save_err")); return false; }
  };
  const addTeam = async (e) => {
    e.preventDefault();
    const em = normEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { setTeamErr(t("au_err_email")); return; }
    if (em === normEmail(FOUNDER_EMAIL) || accounts.teamEmails.includes(em)) { setEmail(""); return; }
    if (await saveTeam([...accounts.teamEmails, em])) setEmail("");
  };
  const pw = (id, label, v, set, auto) => (
    <div><label htmlFor={id} className="text-sm font-semibold text-soil">{label}</label>
      <input id={id} type="password" autoComplete={auto} value={v} onChange={(e) => { set(e.target.value); setErr(""); }} disabled={!founder} className={inputCls + " mt-1"} dir="ltr" /></div>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={savePin} className="space-y-3 rounded-2xl border border-soil/10 bg-white p-5 shadow-sm" noValidate>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold text-forest"><KeyRound className="h-4 w-4" aria-hidden="true" />{t("ads_pin_title")}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${enabled ? "bg-leaf/15 text-forest" : "bg-soil/10 text-soil/80"}`}>{t(enabled ? "ads_pin_status_on" : "ads_pin_status_off")}</span>
        </div>
        <p className="text-xs text-soil/80">{t("ads_pin_sub")}</p>
        {enabled && sec.updatedAt && <p className="text-xs text-soil/80">{t("ads_last").replace("{d}", new Date(sec.updatedAt).toLocaleString("en-GB")).replace("{e}", sec.updatedBy || "·")}</p>}
        {!founder && <p className="rounded-xl bg-gold/15 p-2.5 text-xs font-semibold text-soil">{t("ads_founder_only")}</p>}
        {enabled && pw("ads-cur", t("adp_current"), cur, setCur, "current-password")}
        {pw("ads-new", t("adp_new"), nw, setNw, "new-password")}
        {pw("ads-new2", t("adp_confirm"), nw2, setNw2, "new-password")}
        {err && <p className="text-sm font-semibold text-red-700" role="alert">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={!founder || busy || !nw || (enabled && !cur)} className="inline-flex items-center gap-2 rounded-xl bg-forest px-4 py-2.5 text-sm font-bold text-ivory disabled:opacity-40"><ShieldCheck className="h-4 w-4" aria-hidden="true" />{t(enabled ? "ads_change" : "ads_pin_enable")}</button>
          {enabled && <button type="button" onClick={turnOff} disabled={!founder || busy || !cur} className="rounded-xl border border-red-300 px-4 py-2.5 text-sm font-bold text-red-800 disabled:opacity-40">{t("ads_pin_disable")}</button>}
        </div>
      </form>
      <div className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-bold text-forest"><Users className="h-4 w-4" aria-hidden="true" />{t("ads_team")}</h3>
        <p className="mt-0.5 text-xs text-soil/80">{t("ads_team_sub")}</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li className="flex items-center justify-between gap-2 rounded-lg bg-ivory px-3 py-2"><span className="truncate font-mono text-xs" dir="ltr">{FOUNDER_EMAIL}</span><span className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-bold text-gold">{t("ads_founder")}</span></li>
          {accounts.teamEmails.length === 0 && <li className="px-1 text-xs text-soil/80">{t("ads_team_none")}</li>}
          {accounts.teamEmails.map((em) => (
            <li key={em} className="flex items-center justify-between gap-2 rounded-lg bg-ivory px-3 py-2">
              <span className="truncate font-mono text-xs" dir="ltr">{em}</span>
              {founder && <button type="button" onClick={() => saveTeam(accounts.teamEmails.filter((x) => x !== em))} className="rounded-lg p-1 text-red-700 hover:bg-red-50" aria-label={`Remove ${em}`}><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
        {founder && (
          <form onSubmit={addTeam} className="mt-3 flex gap-2" noValidate>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setTeamErr(""); }} placeholder="name@example.com" className={inputCls} dir="ltr" aria-label={t("ads_team")} />
            <button type="submit" className="rounded-xl bg-forest px-4 text-sm font-bold text-ivory">{t("ads_team_add")}</button>
          </form>
        )}
        {teamErr && <p className="mt-2 text-sm font-semibold text-red-700" role="alert">{teamErr}</p>}
      </div>
    </div>
  );
}

function AdminConsole({ t, dn, lang, listings, setListingStatus, bookings, liveRequests, settings, setSettings, resetDemo, toast, accounts, mandiPosts = [], cloud, demoMode = false, setDemoMode, demand = [], saveDemand, onLock, sec, setSec }) {
  const [sub, setSub] = useState("verify");
  const [lsFilter, setLsFilter] = useState("pending");
  const [diesel, setDiesel] = useState(settings.dieselPrice);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => { setDiesel(settings.dieselPrice); }, [settings.dieselPrice]);
  const lock = onLock;

  const counts = { pending: 0, approved: 0, rejected: 0 };
  listings.forEach((l) => { counts[l.status || "approved"]++; });
  const shownListings = listings.filter((l) => (l.status || "approved") === lsFilter).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  const live = bookings.filter((b) => !["cancelled", "declined"].includes(b.status));
  const gtv = live.reduce((s, b) => s + (b.quote.total || 0), 0);
  const earned = bookings.filter((b) => ACTIVE_STATUSES.includes(b.status)).reduce((s, b) => s + (b.quote.commission || 0), 0);
  const pendingComm = bookings.filter((b) => ["sent", "countered"].includes(b.status)).reduce((s, b) => s + (b.quote.commission || 0), 0);
  const sortedBookings = [...bookings].sort((a, b) => b.createdAt - a.createdAt);
  const creditOut = bookings.filter((b) => b.financing && b.financing.status !== "settled" && !["cancelled", "declined"].includes(b.status)).reduce((s, b) => s + b.financing.balance, 0);
  const channelLabel = (c) => (c === "ussd" ? "USSD" : c === "live" ? "Apni Boli" : "App");
  // older records may lack a phone: fall back to the member profile with the same email
  const byEmail = useMemo(() => { const m = new Map(); (accounts.members || []).forEach((x) => { if (x.email) m.set(normEmail(x.email), x); }); return m; }, [accounts.members]);
  const prof = (email) => (email ? byEmail.get(normEmail(email)) : null) || {};
  const alerts = [
    ...listings.filter((l) => l.status === "pending").map((l) => ({ id: "l" + l.id, at: l.submittedAt || 0, kind: "listing", sub: "verify", title: l.name, who: l.ownerName, where: `${l.village || ""}${l.district ? ", " + dn(l.district) : ""}` })),
    ...liveRequests.filter((r) => r.status === "open").map((r) => ({ id: "r" + r.id, at: r.createdAt || 0, kind: "request", sub: "live", title: `${t("one_" + r.category)} · ${pkr(r.rate)}/hr`, who: r.renterName || prof(r.renterEmail).name || "", where: r.village || "" })),
    ...demand.filter((d) => d.status === "waiting").map((d) => ({ id: "d" + d.id, at: d.createdAt || 0, kind: "demand", sub: "demand", title: `${t("one_" + d.category)} · ${t("dm_" + d.type)}`, who: d.renterName || "", where: d.village || dn(d.district || "") })),
    ...bookings.filter((b) => b.status === "sent").map((b) => ({ id: "b" + b.id, at: b.createdAt || 0, kind: "booking", sub: "live", title: b.listingName, who: b.renterName || "", where: dn(b.district || "") })),
  ].sort((a, b) => b.at - a.at);

  const copyLedger = async () => {
    const rows = [["Booking", "Date", "Machine", "Renter", "Channel", "Status", "Value PKR", "Commission PKR"], ...sortedBookings.map((b) => [b.id, b.date, b.listingName, b.renterName, channelLabel(b.channel), b.status, b.quote.total, b.quote.commission])];
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
    try { await navigator.clipboard.writeText(csv); toast(t("mem_copied")); } catch (e) { toast("Copy is not allowed here."); }
  };

  const saveDiesel = (e) => {
    e.preventDefault();
    const v = Math.round(Number(diesel) * 100) / 100;
    if (!(v >= 50 && v <= 2000)) return;
    setSettings((s) => ({ ...s, dieselPrice: v, dieselUpdatedAt: Date.now() }));
    toast(t("toast_diesel").replace("{v}", pkr(v)));
  };
  const toggleProvince = (c) => {
    setSettings((s) => {
      const on = s.activeProvinces.includes(c);
      if (on && s.activeProvinces.length === 1) { toast(t("ad_min_one_prov")); return s; }
      return { ...s, activeProvinces: on ? s.activeProvinces.filter((x) => x !== c) : PROVINCES.filter((x) => x === c || s.activeProvinces.includes(x)) };
    });
  };
  const previewLitres = DIESEL_L_PER_HR.harvester * 4;

  const subs = [
    { key: "verify", label: t("ad_verify"), icon: BadgeCheck, badge: counts.pending },
    { key: "ledger", label: t("ad_ledger"), icon: Wallet },
    { key: "settings", label: t("ad_settings"), icon: SlidersHorizontal },
    { key: "live", label: t("ad_live"), icon: Radar, badge: liveRequests.filter((r) => r.status === "open").length + bookings.filter((b) => b.status === "sent").length },
    { key: "demand", label: t("ad_demand"), icon: Inbox, badge: demand.filter((d) => d.status === "waiting").length },
    { key: "mandi", label: t("nav_mandi"), icon: Wheat },
    { key: "members", label: t("nav_members"), icon: Users },
    { key: "security", label: t("ads_tab"), icon: KeyRound },
  ];

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6" aria-labelledby="ad-h">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ad-h" className="flex items-center gap-2 font-display text-2xl font-extrabold text-forest"><ShieldCheck className="h-6 w-6" aria-hidden="true" />{t("ad_title")}</h2>
          <p className="mt-1 text-sm text-soil/80">{t("ad_sub")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge t={t} demo={demoMode} />
          <CloudBadge t={t} cloud={cloud} detail />
          {lock && <button onClick={lock} className="inline-flex items-center gap-2 rounded-xl border border-soil/20 bg-white px-3 py-2 text-sm font-bold text-soil"><Lock className="h-4 w-4" aria-hidden="true" />{t("ad_lock")}</button>}
        </div>
      </div>
      {/* New Activity Alerts: everything that needs the founder's attention, newest first */}
      <div className={`mb-5 rounded-2xl p-4 ring-1 ${alerts.length ? "bg-red-50 ring-red-200" : "bg-white ring-soil/10"}`} role="region" aria-labelledby="al-h" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="al-h" className="flex items-center gap-2 font-bold text-forest">
            <span className="relative flex h-2.5 w-2.5">{alerts.length > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />}<span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${alerts.length ? "bg-red-600" : "bg-leafink"}`} /></span>
            {t("al_title")}
          </h3>
          {alerts.length > 0 && <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">{t("al_sub").replace("{n}", alerts.length)}</span>}
        </div>
        {alerts.length === 0 ? <p className="mt-2 text-sm text-soil/80">{t("al_none")}</p> : (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-white p-3 text-sm ring-1 ring-red-100">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-[11px] font-bold uppercase tracking-wide text-red-700">{t("al_" + a.kind)}</span>
                  <span className="block break-words font-bold text-forest">{a.title}</span>
                  <span className="block break-words text-xs text-soil/80">{[a.who, a.where, fmtStamp(a.at)].filter(Boolean).join(" · ")}</span>
                </span>
                <button type="button" onClick={() => { setSub(a.sub); if (a.kind === "listing") setLsFilter("pending"); }} className="ms-auto shrink-0 rounded-lg bg-forest px-3 py-1.5 text-xs font-bold text-ivory">{t("al_view")}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Marketplace mode: Live Public Mode (default) vs Sample Demo Data (evaluators) */}
      <div className="mb-5 rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-forest"><Globe className="h-4 w-4" aria-hidden="true" />{t("mode_title")}</h3>
            <p className="mt-0.5 text-xs text-soil/80">{t("mode_sub")}</p>
          </div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2" role="radiogroup" aria-label={t("mode_title")}>
          {[[false, t("mode_live"), t("mode_live_d"), ShieldCheck, t("mode_go_live")], [true, t("mode_demo"), t("mode_demo_d"), PlayCircle, t("mode_load_demo")]].map(([val, title, desc, Icon, cta]) => {
            const on = demoMode === val;
            return (
              <button key={String(val)} type="button" role="radio" aria-checked={on} onClick={() => { if (!on && setDemoMode) setDemoMode(val); }}
                className={`flex items-start gap-3 rounded-xl p-3 text-start ring-1 transition ${on ? (val ? "bg-gold/15 ring-2 ring-gold" : "bg-leaf/15 ring-2 ring-leaf") : "bg-ivory ring-soil/15 hover:ring-leaf"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? "bg-forest text-gold" : "bg-white text-soil/80 ring-1 ring-soil/15"}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-bold text-forest">{title}{on && <CircleCheck className="h-4 w-4 text-leafink" aria-hidden="true" />}</span>
                  <span className="mt-0.5 block text-xs text-soil/80">{desc}</span>
                  {!on && <span className="mt-2 inline-flex rounded-lg bg-forest px-2.5 py-1 text-xs font-bold text-ivory">{cta}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl bg-forest p-4 text-ivory"><p className="text-xs text-ivory/80">{t("ad_kpi_comm")}</p><p className="font-display text-2xl font-extrabold text-gold" dir="ltr">{pkr(earned)}</p></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-soil/10"><p className="text-xs text-soil/80">{t("ad_kpi_gtv")}</p><p className="font-display text-2xl font-extrabold text-forest" dir="ltr">{pkr(gtv)}</p></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-soil/10"><p className="text-xs text-soil/80">{t("ad_kpi_pending")}</p><p className="font-display text-2xl font-extrabold text-forest" dir="ltr">{pkr(pendingComm)}</p></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-soil/10"><p className="text-xs text-soil/80">{t("ad_pending")}</p><p className="font-display text-2xl font-extrabold text-forest">{counts.pending}</p></div>
        <div className="rounded-2xl bg-gold/15 p-4 ring-1 ring-gold/40"><p className="text-xs text-soil/80">{t("ad_kpi_credit")}</p><p className="font-display text-2xl font-extrabold text-soil" dir="ltr">{pkr(creditOut)}</p></div>
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto" role="tablist">
        {subs.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} role="tab" aria-selected={sub === key} onClick={() => setSub(key)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ring-1 ${sub === key ? "bg-forest text-ivory ring-forest" : "bg-white text-forest ring-soil/15 hover:ring-leaf"}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}{badge ? <span className="rounded-full bg-gold px-1.5 text-[11px] text-soil">{badge}</span> : null}
          </button>
        ))}
      </div>

      {sub === "verify" && (
        <div className="rounded-2xl border border-soil/10 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            {["pending", "approved", "rejected"].map((s) => (
              <button key={s} onClick={() => setLsFilter(s)} aria-pressed={lsFilter === s}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 ${lsFilter === s ? "bg-forest text-ivory ring-forest" : "bg-ivory text-soil ring-soil/15"}`}>{t("ls_" + s)} ({counts[s]})</button>
            ))}
          </div>
          {shownListings.length === 0 ? <p className="rounded-xl bg-ivory p-6 text-center text-sm text-soil/80">{t("ad_none")}</p> : (
            <ul className="grid gap-3 md:grid-cols-2">
              {shownListings.map((l) => (
                <li key={l.id} className={`rounded-xl border p-4 ${(l.status || "approved") === "pending" ? "border-gold bg-gold/5" : "border-soil/10 bg-ivory/50"}`}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest text-gold"><CategoryIcon category={l.category} className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><p className="font-bold text-forest">{l.name}</p><ListingStatusPill status={l.status} t={t} /></div>
                      <p className="text-xs text-soil/80">{t("one_" + l.category)} · {l.village}, {dn(l.district)} · <span dir="ltr">{l.distance} km</span></p>
                      <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs text-soil sm:grid-cols-[auto_1fr]">
                        <dt className="font-semibold text-soil/80">{t("ct_owner")}</dt>
                        <dd className="break-words font-bold">{l.ownerName || prof(l.ownerEmail).name || "·"} <span className="font-normal text-soil/80" dir="ltr">({l.ownerId})</span></dd>
                        <dt className="font-semibold text-soil/80">{t("au_phone")}</dt>
                        <dd><ContactButtons t={t} phone={l.ownerPhone || prof(l.ownerEmail).phone} name={l.ownerName} /></dd>
                        <dt className="font-semibold text-soil/80">{t("au_email")}</dt>
                        <dd className="break-all">{l.ownerEmail ? <a href={`mailto:${l.ownerEmail}`} className="font-semibold text-forest underline underline-offset-2" dir="ltr">{l.ownerEmail}</a> : "·"}</dd>
                        <dt className="font-semibold text-soil/80">{t("ct_location")}</dt>
                        <dd className="break-words">{[l.village, dn(l.district || ""), l.province && l.province !== "PB" ? l.province : ""].filter(Boolean).join(", ")}</dd>
                        <dt className="font-semibold text-soil/80">{t("ct_model")}</dt>
                        <dd className="break-words" dir="ltr">{l.name}{l.spec ? ` · ${l.spec}` : ""}</dd>
                        <dt className="font-semibold text-soil/80">{t("ct_rate")}</dt>
                        <dd className="font-bold text-forest" dir="ltr">{pkr(l.rate)}/hr</dd>
                        <dt className="font-semibold text-soil/80">{t("lr_rent")}</dt>
                        <dd>{t(l.rentType === "wet" ? "ct_rent_wet" : "ct_rent_dry")} · {l.operator === "included" ? t("op_included") : l.operator === "optional" ? t("op_optional") : t("op_none")} · {l.transport === "included" ? t("tr_included") : l.transport === "optional" ? t("tr_optional") : t("tr_self")}</dd>
                        <dt className="font-semibold text-soil/80">{t("ct_time")}</dt>
                        <dd dir="ltr">{fmtStamp(l.submittedAt)}</dd>
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {(l.status || "approved") !== "approved" && <button onClick={() => setListingStatus(l.id, "approved")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-forest px-3 py-2 text-sm font-bold text-ivory"><Check className="h-4 w-4" aria-hidden="true" />{t("ad_approve")}</button>}
                    {(l.status || "approved") !== "rejected" && <button onClick={() => setListingStatus(l.id, "rejected")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-bold text-red-800"><Ban className="h-4 w-4" aria-hidden="true" />{t("ad_reject")}</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sub === "ledger" && (
        <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-soil/10 p-4">
            <p className="text-sm font-semibold text-soil">{t("ad_kpi_bookings")}: <b>{bookings.length}</b></p>
            <button onClick={copyLedger} disabled={!bookings.length} className="inline-flex items-center gap-2 rounded-xl border border-forest/20 px-3 py-2 text-sm font-bold text-forest disabled:opacity-40"><Copy className="h-4 w-4" aria-hidden="true" />{t("mem_copy")}</button>
          </div>
          {sortedBookings.length === 0 ? <p className="p-6 text-center text-sm text-soil/80">{t("ad_none")}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-ivory text-xs uppercase tracking-wide text-soil/80">
                  <tr>{["ad_col_id", "ad_col_date", "ad_col_machine", "ad_col_renter", "ad_col_channel", "ad_col_status", "ad_col_value", "ad_col_comm"].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{t(h)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-soil/10">
                  {sortedBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-ivory/60">
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{b.id}</td>
                      <td className="px-4 py-3 text-xs" dir="ltr">{fmtDate(b.date)}</td>
                      <td className="px-4 py-3 font-semibold text-forest">{b.listingName}</td>
                      <td className="px-4 py-3">{b.renterName}</td>
                      <td className="px-4 py-3"><span className="rounded-full bg-ivory px-2 py-0.5 text-xs font-bold ring-1 ring-soil/15">{channelLabel(b.channel)}</span></td>
                      <td className="px-4 py-3"><StatusPill status={b.status} t={t} /></td>
                      <td className="px-4 py-3 font-semibold tabular-nums" dir="ltr">{pkr(b.quote.total)}</td>
                      <td className={`px-4 py-3 font-bold tabular-nums ${ACTIVE_STATUSES.includes(b.status) ? "text-forest" : "text-soil/80"}`} dir="ltr">{pkr(b.quote.commission)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-ivory font-bold text-forest">
                  <tr><td className="px-4 py-3" colSpan={6}>{t("ad_kpi_gtv")} / {t("ad_kpi_comm")}</td><td className="px-4 py-3" dir="ltr">{pkr(gtv)}</td><td className="px-4 py-3" dir="ltr">{pkr(earned)}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {sub === "settings" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={saveDiesel} className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold text-forest"><Fuel className="h-4 w-4" aria-hidden="true" />{t("ad_diesel")}</h3>
            <p className="mt-1 text-xs text-soil/80">{t("ad_diesel_sub")}</p>
            <div className="mt-4 flex gap-2">
              <label htmlFor="ad-diesel" className="sr-only">{t("ad_diesel")}</label>
              <input id="ad-diesel" type="number" min="50" max="2000" step="0.01" value={diesel} onChange={(e) => setDiesel(e.target.value)} className={inputCls + " text-lg font-extrabold text-forest"} dir="ltr" />
              <button type="submit" className="rounded-xl bg-forest px-5 text-sm font-bold text-ivory">{t("ad_save")}</button>
            </div>
            <p className="mt-2 text-xs text-soil/80" dir="ltr">{t("ad_updated")}: {settings.dieselUpdatedAt ? new Date(settings.dieselUpdatedAt).toLocaleString("en-GB") : "13 Nov 2026 benchmark"}</p>
            <p className="mt-3 rounded-xl bg-gold/15 p-3 text-sm font-semibold text-soil">{t("ad_diesel_preview").replace("{l}", previewLitres).replace("{v}", pkr(previewLitres * settings.dieselPrice))}</p>
          </form>
          <div className="rounded-2xl border border-soil/10 bg-white p-5 shadow-sm">
            <h3 className="flex items-center gap-2 font-bold text-forest"><MapPin className="h-4 w-4" aria-hidden="true" />{t("ad_provinces")}</h3>
            <p className="mt-1 text-xs text-soil/80">{t("ad_provinces_sub")}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {PROVINCES.map((c) => {
                const on = settings.activeProvinces.includes(c);
                return (
                  <button key={c} type="button" onClick={() => toggleProvince(c)} aria-pressed={on}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start text-sm font-bold ring-1 ${on ? "bg-leaf/15 text-forest ring-leaf/40" : "bg-ivory text-soil/80 ring-soil/15"}`}>
                    {provName(lang, c)}{on ? <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> : <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50/50 p-5 lg:col-span-2">
            <h3 className="flex items-center gap-2 font-bold text-red-900"><RotateCcw className="h-4 w-4" aria-hidden="true" />{t("ad_reset")}</h3>
            <p className="mt-1 text-xs text-red-900/80">{t("ad_reset_sub")}</p>
            <button type="button" onClick={() => { if (confirmReset) { resetDemo(); setConfirmReset(false); } else { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); } }}
              className={`mt-3 rounded-xl px-4 py-2 text-sm font-bold ${confirmReset ? "bg-red-700 text-white" : "border border-red-300 text-red-800"}`}>{confirmReset ? t("ad_reset_confirm") : t("ad_reset")}</button>
          </div>
        </div>
      )}

      {sub === "members" && <MembersAdmin t={t} dn={dn} accounts={accounts} toast={toast} embedded />}

      {sub === "security" && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold text-forest"><ShieldCheck className="h-5 w-5" aria-hidden="true" />{t("ads_title")}</h3>
          <AdminSecurity t={t} accounts={accounts} sec={sec} setSec={setSec} toast={toast} />
        </div>
      )}

      {sub === "demand" && (
        <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
          {demand.length === 0 ? <p className="p-6 text-center text-sm text-soil/80">{t("ad_demand_none")}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-ivory text-xs uppercase tracking-wide text-soil/80">
                  <tr>{["ID", t("ad_demand"), t("lr_machine"), t("lr_village"), t("lr_date"), t("ad_req_rate"), t("ad_col_renter"), t("ad_col_status"), ""].map((h, i) => <th key={i} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-soil/10">
                  {[...demand].sort((a, b) => b.createdAt - a.createdAt).map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{d.id}</td>
                      <td className="px-4 py-3 text-xs font-semibold">{t("dm_" + d.type)}{d.discountPct ? ` · ${d.discountPct}%` : ""}</td>
                      <td className="px-4 py-3">{t("one_" + d.category)}</td>
                      <td className="px-4 py-3">{d.village || dn(d.district)}</td>
                      <td className="px-4 py-3 text-xs" dir="ltr">{fmtDate(d.date)} · {d.hours}h</td>
                      <td className="px-4 py-3 font-semibold" dir="ltr">{pkr(d.rate)}/hr</td>
                      <td className="px-4 py-3 text-xs"><span className="block font-semibold">{d.renterName || "·"}</span>{d.renterEmail ? <span className="block break-all" dir="ltr">{d.renterEmail}</span> : null}<ContactButtons t={t} phone={d.renterPhone || prof(d.renterEmail).phone} name={d.renterName} /></td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${d.status === "matched" ? "bg-leaf/15 text-forest" : d.status === "waiting" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("dm_" + d.status)}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5">
                          {d.status === "waiting" && <button type="button" onClick={() => saveDemand({ id: d.id, status: "contacted", updatedAt: Date.now() })} className="rounded-lg border border-soil/20 px-2 py-1 text-xs font-bold text-soil">{t("ad_demand_contacted")}</button>}
                          {d.status !== "matched" && <button type="button" onClick={() => saveDemand({ id: d.id, status: "matched", updatedAt: Date.now() })} className="rounded-lg bg-forest px-2 py-1 text-xs font-bold text-ivory">{t("ad_demand_matched")}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sub === "mandi" && (
        <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
          {mandiPosts.length === 0 ? <p className="p-6 text-center text-sm text-soil/80">{t("ad_none")}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-ivory text-xs uppercase tracking-wide text-soil/80">
                  <tr>{["ID", t("am_crop"), t("am_qty"), t("lr_village"), t("am_rate"), t("am_sold_to"), t("am_minus_credit"), t("am_net"), t("ad_col_status")].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-soil/10">
                  {[...mandiPosts].sort((a, b) => b.createdAt - a.createdAt).map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{m.id}</td>
                      <td className="px-4 py-3">{t("crop_" + m.crop)}</td>
                      <td className="px-4 py-3" dir="ltr">{m.qty}</td>
                      <td className="px-4 py-3">{m.village}</td>
                      <td className="px-4 py-3" dir="ltr">{pkr(m.rate)}{m.soldRate ? ` → ${pkr(m.soldRate)}` : ""}</td>
                      <td className="px-4 py-3">{m.soldTo || "·"}</td>
                      <td className="px-4 py-3" dir="ltr">{m.creditSettled != null ? pkr(m.creditSettled) : "·"}</td>
                      <td className="px-4 py-3 font-bold text-forest" dir="ltr">{m.net != null ? pkr(m.net) : "·"}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${m.status === "sold" ? "bg-leaf/15 text-forest" : m.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("am_st_" + m.status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sub === "live" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-soil/10 p-4 font-bold text-forest"><Radar className="h-4 w-4" aria-hidden="true" />{t("ad_live_req")} ({liveRequests.length})</h3>
            {liveRequests.length === 0 ? <p className="p-6 text-center text-sm text-soil/80">{t("ad_none")}</p> : (
              <ul className="divide-y divide-soil/10">
                {[...liveRequests].sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).map((r) => {
                  const p0 = prof(r.renterEmail);
                  return (
                    <li key={r.id} className={`grid gap-2 p-4 text-sm md:grid-cols-[1.2fr_1fr_auto] md:items-center ${r.status === "open" ? "bg-gold/5" : ""}`}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs" dir="ltr">{r.id}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === "booked" ? "bg-leaf/15 text-forest" : r.status === "open" ? "bg-gold/25 text-soil" : "bg-soil/10 text-soil/80"}`}>{t("rq_" + r.status)}</span><span className="text-xs text-soil/80" dir="ltr">{fmtStamp(r.createdAt)}</span></p>
                        <p className="mt-1 break-words font-bold text-forest">{t("ct_farmer")}: {r.renterName || p0.name || "·"}</p>
                        <p className="break-all text-xs text-soil/80" dir="ltr">{r.renterEmail || ""}</p>
                      </div>
                      <div className="min-w-0 text-xs text-soil">
                        <p><span className="font-semibold text-soil/80">{t("ct_needed")}:</span> {t("one_" + r.category)}{r.model ? <span dir="ltr"> · {r.model}</span> : null}</p>
                        <p><span className="font-semibold text-soil/80">{t("ct_location")}:</span> {r.village || "·"}{r.loc && r.loc.district ? `, ${dn(r.loc.district)}` : ""}</p>
                        <p><span className="font-semibold text-soil/80">{t("ct_offered")}:</span> <b className="text-forest" dir="ltr">{pkr(r.rate)}/hr</b>{r.agreedRate ? <span dir="ltr"> → {pkr(r.agreedRate)}</span> : null} · {r.hours}h · <span dir="ltr">{fmtDate(r.date)}</span> · {r.rentType === "wet" ? t("lr_wet") : t("lr_dry")} · T{r.tierReached || 1}</p>
                      </div>
                      <div><ContactButtons t={t} phone={r.renterPhone || p0.phone} name={r.renterName || p0.name} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
            <h3 className="flex items-center gap-2 border-b border-soil/10 p-4 font-bold text-forest"><ClipboardList className="h-4 w-4" aria-hidden="true" />{t("ad_live_bk")} ({bookings.length})</h3>
            {sortedBookings.length === 0 ? <p className="p-6 text-center text-sm text-soil/80">{t("ad_none")}</p> : (
              <ul className="divide-y divide-soil/10">
                {sortedBookings.map((b) => {
                  const p0 = prof(b.renterEmail);
                  return (
                    <li key={b.id} className={`grid gap-2 p-4 text-sm md:grid-cols-[1.2fr_1fr_auto] md:items-center ${b.status === "sent" ? "bg-gold/5" : ""}`}>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs" dir="ltr">{b.id}</span><StatusPill status={b.status} t={t} /><span className="rounded-full bg-ivory px-2 py-0.5 text-[11px] font-bold ring-1 ring-soil/15">{channelLabel(b.channel)}</span><span className="text-xs text-soil/80" dir="ltr">{fmtStamp(b.createdAt)}</span></p>
                        <p className="mt-1 break-words font-bold text-forest">{t("ct_farmer")}: {b.renterName || p0.name || "·"}</p>
                        <p className="break-all text-xs text-soil/80" dir="ltr">{b.renterEmail || ""}</p>
                      </div>
                      <div className="min-w-0 text-xs text-soil">
                        <p><span className="font-semibold text-soil/80">{t("ct_model")}:</span> <span dir="ltr">{b.listingName}</span> ({t("one_" + b.category)})</p>
                        <p><span className="font-semibold text-soil/80">{t("ct_location")}:</span> {dn(b.district || "") || "·"}</p>
                        <p><span className="font-semibold text-soil/80">{t("ct_rate")}:</span> <b className="text-forest" dir="ltr">{pkr(b.quote.rate || 0)}/hr</b> · {b.hours}h · <span dir="ltr">{fmtDate(b.date)}</span> · <span dir="ltr">{pkr(b.quote.total || 0)}</span></p>
                      </div>
                      <div><ContactButtons t={t} phone={b.renterPhone || p0.phone} name={b.renterName || p0.name} /></div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts: sign up / sign in                                         */
/* Cloud mode (published page in Claude): each visitor's member record */
/* is written to the shared db at members/<id>, readable only by the   */
/* owner and editors; the password hash lives in the visitor's private */
/* data/users/<id>/account document. Local mode: this browser only.    */
/* ------------------------------------------------------------------ */
async function hashPassword(email, password) {
  const input = `agrishare:${email.toLowerCase()}:${password}`;
  try {
    const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    let h = 5381;
    for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
    return "f" + (h >>> 0).toString(16);
  }
}
const withTimeout = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);
const cleanEmail = (e) => String(e || "").trim().toLowerCase();
// 03001234567 / 3001234567 / +923001234567 -> +923001234567 (null if not a Pakistani mobile)
const toE164PK = (raw) => {
  const d = String(raw || "").replace(/[^\d+]/g, "");
  if (/^\+923\d{9}$/.test(d)) return d;
  if (/^923\d{9}$/.test(d)) return "+" + d;
  if (/^03\d{9}$/.test(d)) return "+92" + d.slice(1);
  if (/^3\d{9}$/.test(d)) return "+92" + d;
  return null;
};
const phoneLocal = (e164) => (e164 && e164.startsWith("+92") ? "0" + e164.slice(3) : e164 || "");
const publicProfile = (a) => ({ name: a.name, email: a.email, phone: a.phone || "", role: a.role, country: a.country || locCountry(a) || "PK", district: a.district, province: a.province || "PB", village: a.village || "", lat: a.lat || null, lng: a.lng || null, createdAt: a.createdAt });
const profileLocation = (p) => (p && p.lat ? { country: p.country || locCountry(p), province: p.province || "PB", district: p.district, village: p.village || "", lat: p.lat, lng: p.lng, source: "profile" } : null);

function useAccounts() {
  const [mode, setMode] = useState("loading"); // loading | cloud (Claude) | firebase | local
  const [fbUid, setFbUid] = useState(null);
  const [fbReady, setFbReady] = useState(false); // true once Firebase Auth has reported the signed-in user (or none)
  const [session, setSessionState] = useState(() => store.get("agrishare.session", null));
  const [cloudOwner, setCloudOwner] = useState(false); // owner of the page when hosted in Claude (Members tab only)
  const [fbUser, setFbUser] = useState(null); // { uid, email, emailVerified } of the Firebase user
  const [teamEmails, setTeamEmails] = useState([]);
  const [members, setMembers] = useState([]);
  const [membersState, setMembersState] = useState("idle"); // idle | loading | ready | slow | error
  const ref = useRef({ db: null, user: null, uid: null, canWrite: true });
  // true while signUp/signIn is running, so the auth listener does not overwrite the fresh session
  const authBusyRef = useRef(false);

  const setSession = (sess) => { setSessionState(sess); store.set("agrishare.session", sess); };
  // Firestore profile writes never block the sign-in UI: fire and forget
  const bgWrite = (col, id, data) => { writeDoc(col, id, data).catch((e) => console.warn("[Agri-Share] Profile save deferred:", e && e.code)); };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.claude && typeof window.claude.use === "function") {
          const [db, user] = await withTimeout(Promise.all([window.claude.use("db"), window.claude.use("user")]), 10000, [null, null]);
          if (db && user) {
            const uid = await user.id();
            if (uid) {
              ref.current = { db, user, uid, canWrite: true };
              let admin = false;
              try { admin = !!(await user.isOwner()) || !!(await user.canEdit()); } catch (e) { /* ignore */ }
              try { if ((await user.can("data.write")) === false) ref.current.canWrite = false; } catch (e) { /* ignore */ }
              if (alive) { setCloudOwner(admin); setMode("cloud"); }
              return;
            }
          }
        }
      } catch (e) { /* fall back to local */ }
      if (alive) setMode(FIREBASE_ENABLED ? "firebase" : "local");
    })();
    return () => { alive = false; };
  }, []);

  // Firebase Auth: keep the session in step with the signed-in Firebase user
  useEffect(() => {
    if (mode !== "firebase") return undefined;
    return watchAuth(async (user) => {
      setFbReady(true);
      setFbUid(user ? user.uid : null);
      setFbUser(user ? { uid: user.uid, email: normEmail(user.email), emailVerified: !!user.emailVerified } : null);
      if (!user) {
        setSessionState((cur) => { if (cur && cur.store === "firebase") { store.set("agrishare.session", null); return null; } return cur; });
        return;
      }
      const cur = store.get("agrishare.session", null);
      if (authBusyRef.current || (cur && cur.uid === user.uid)) return;
      let prof = null;
      try { prof = await withTimeout(readDoc(COL.users, user.uid), 4000, null); } catch (e) { /* offline */ }
      const now = store.get("agrishare.session", null);
      if (authBusyRef.current || (now && now.uid === user.uid)) return;
      const p = prof || { name: user.displayName || user.email || phoneLocal(user.phoneNumber), email: user.email || "", phone: phoneLocal(user.phoneNumber), role: "renter", createdAt: Date.now() };
      setSession({ uid: user.uid, ...publicProfile(p), location: profileLocation(p), store: "firebase" });
    });
  }, [mode]); // eslint-disable-line

  // Members list: live for the owner in cloud mode, from this browser in local mode
  useEffect(() => {
    const localMembers = () => store.get("agrishare.members.v1", []).map((m) => ({ id: m.id, ...publicProfile(m), lastLoginAt: m.lastLoginAt, source: "local" }));
    if (mode === "local") {
      setMembers(localMembers());
      setMembersState("ready");
      return undefined;
    }
    if (mode === "firebase") {
      // Firestore "users" profiles (rules let signed-in members read them) plus accounts kept only on this browser
      setMembers(localMembers());
      if (!fbUid) { setMembersState("ready"); return undefined; }
      setMembersState("loading");
      return watchCollection(COL.users, (list, meta) => {
        const cloudList = list.map((d) => ({ ...d, source: "firebase" }));
        const emails = new Set(cloudList.map((m) => m.email));
        setMembers([...cloudList, ...localMembers().filter((m) => !emails.has(m.email))]);
        if (!meta.fromCache) setMembersState("ready");
      }, () => setMembersState("ready"));
    }
    if (mode !== "cloud" || !cloudOwner) return undefined;
    const { db } = ref.current;
    setMembersState("loading");
    const timer = setTimeout(() => setMembersState((st) => (st === "loading" ? "slow" : st)), 10000);
    const unsub = db.collection("members").onSnapshot(
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}), source: "cloud" })));
        if (!snap.metadata.fromCache) { clearTimeout(timer); setMembersState("ready"); }
      },
      () => { clearTimeout(timer); setMembersState("error"); }
    );
    return () => { clearTimeout(timer); unsub(); };
  }, [mode, cloudOwner, fbUid]);

  // Team admin emails the founder has authorised (admin_settings/team)
  useEffect(() => {
    if (mode !== "firebase" || !fbUid) { setTeamEmails([]); return undefined; }
    return watchDoc(COL.settings, "team", (data) => setTeamEmails(Array.isArray(data && data.emails) ? data.emails.map(normEmail) : []), () => setTeamEmails([]));
  }, [mode, fbUid]);
  const isFounder = mode === "firebase" && !!fbUser && fbUser.email === normEmail(FOUNDER_EMAIL);
  // Admin tab only for the founder or an authorised team email signed in with Firebase
  const isAdmin = mode === "firebase" && !!fbUser && !!fbUser.email && (ADMIN_EMAILS.map(normEmail).includes(fbUser.email) || teamEmails.includes(fbUser.email));
  const refreshFbUser = async () => {
    const u = await fbRefreshUser();
    if (u) setFbUser({ uid: u.uid, email: normEmail(u.email), emailVerified: !!u.emailVerified });
    return u;
  };

  const localList = () => store.get("agrishare.members.v1", []);
  const saveLocal = (list) => {
    store.set("agrishare.members.v1", list);
    if (mode === "local") setMembers(list.map((m) => ({ id: m.id, ...publicProfile(m), lastLoginAt: m.lastLoginAt, source: "local" })));
  };

  const signUpLocal = (acct) => {
    const list = localList();
    if (list.some((m) => m.email === acct.email)) return { error: "au_err_taken" };
    const rec = { ...acct, id: "local-" + Date.now(), lastLoginAt: Date.now() };
    saveLocal([...list, rec]);
    const sess = { uid: rec.id, ...publicProfile(rec), location: profileLocation(rec), store: "local" };
    setSession(sess);
    return { ok: true, session: sess };
  };

  const isAdminEmail = (email) => ADMIN_EMAILS.map(normEmail).includes(normEmail(email)) || teamEmails.includes(normEmail(email));
  const signUp = async (form) => {
    const email = cleanEmail(form.email);
    const loc = form.location || DEFAULT_LOC;
    const acct = { name: form.name.trim(), email, phone: form.phone.trim(), role: form.role, country: loc.country || locCountry(loc), district: loc.district, province: loc.province, village: loc.village || "", lat: loc.lat, lng: loc.lng, createdAt: Date.now(), hash: await hashPassword(email, form.password) };
    if (mode === "firebase") {
      authBusyRef.current = true;
      try {
        const user = await fbSignUp(email, form.password, acct.name);
        // Auth succeeded: set the session now; the Firestore profile is saved in the background
        const sess = { uid: user.uid, ...publicProfile(acct), location: profileLocation(acct), store: "firebase" };
        setSession(sess);
        bgWrite(COL.users, user.uid, { ...publicProfile(acct), lastLoginAt: Date.now() });
        authBusyRef.current = false;
        return { ok: true, session: sess };
      } catch (e) {
        authBusyRef.current = false;
        const code = e && e.code;
        if (code === "auth/email-already-in-use") return { error: "au_err_taken" };
        if (code === "auth/invalid-email") return { error: "au_err_email" };
        if (code === "auth/weak-password") return { error: "au_err_pass" };
        if (code === "auth/operation-not-allowed") return { error: "au_err_provider" };
        // admin accounts must exist in Firebase Auth, never only in this browser
        if (isAdminEmail(email)) return { error: code === "auth/network-request-failed" ? "au_err_network" : "au_err_generic" };
        // network down, Email/Password not enabled yet, or bad config: keep the account on this browser
        const r = signUpLocal(acct);
        return { ...r, localOnly: true };
      }
    }
    if (mode === "cloud" && ref.current.canWrite) {
      const { db, uid } = ref.current;
      try {
        const accRef = db.doc(`data/users/${uid}/account`);
        const existing = await accRef.get();
        if (existing.exists) return { error: "au_err_exists" };
        await accRef.set(acct);
        await db.doc(`members/${uid}`).set({ ...publicProfile(acct), lastLoginAt: Date.now() });
        const sess = { uid, ...publicProfile(acct), location: profileLocation(acct), store: "cloud" };
        setSession(sess);
        return { ok: true, session: sess };
      } catch (e) {
        if (e && e.code === "invalid_argument") ref.current.canWrite = false;
        else return { error: "au_err_generic" };
      }
    }
    const r = signUpLocal(acct);
    return mode === "cloud" ? { ...r, localOnly: true } : r;
  };

  const signIn = async (emailRaw, password) => {
    const email = cleanEmail(emailRaw);
    const hash = await hashPassword(email, password);
    if (mode === "firebase") {
      authBusyRef.current = true;
      try {
        const user = await fbSignIn(email, password);
        // Auth succeeded. Use the cached profile if it arrives quickly; never wait on the network.
        const TIMED_OUT = {};
        const profP = readDoc(COL.users, user.uid).catch(() => null);
        let prof = await withTimeout(profP, 1200, TIMED_OUT);
        const late = prof === TIMED_OUT;
        if (late) prof = null;
        const prev = store.get("agrishare.session", null);
        const fallback = prev && prev.uid === user.uid ? prev : { name: user.displayName || email, email, role: "renter", createdAt: Date.now() };
        const p = prof || fallback;
        const sess = { uid: user.uid, ...publicProfile(p), location: profileLocation(p), store: "firebase" };
        setSession(sess);
        authBusyRef.current = false;
        if (late) {
          // profile arrived after the modal closed: refresh the session with the real role/location
          profP.then((full) => {
            if (!full) return;
            const cur = store.get("agrishare.session", null);
            if (cur && cur.uid === user.uid) setSession({ uid: user.uid, ...publicProfile(full), location: profileLocation(full), store: "firebase" });
            bgWrite(COL.users, user.uid, { ...publicProfile(full), lastLoginAt: Date.now() });
          });
        } else bgWrite(COL.users, user.uid, { ...publicProfile(p), lastLoginAt: Date.now() });
        return { ok: true, session: sess };
      } catch (e) {
        authBusyRef.current = false;
        const code = e && e.code;
        if (code === "auth/operation-not-allowed") return { error: "au_err_provider" };
        if (isAdminEmail(email)) {
          if (code === "auth/network-request-failed") return { error: "au_err_network" };
          if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/invalid-login-credentials" || code === "auth/user-not-found") return { error: "au_err_admin_local" };
          return { error: "au_err_generic" };
        }
        const local = localList().find((x) => x.email === email);
        if (!local) {
          if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/invalid-login-credentials") return { error: "au_err_wrong" };
          if (code === "auth/user-not-found") return { error: "au_err_none" };
          if (code === "auth/too-many-requests") return { error: "au_err_generic" };
        }
        // fall through to an account kept on this browser
      }
    }
    if (mode === "cloud") {
      const { db, uid } = ref.current;
      try {
        const snap = await db.doc(`data/users/${uid}/account`).get();
        if (snap.exists) {
          const a = snap.data();
          if (a.email !== email || a.hash !== hash) return { error: "au_err_wrong" };
          try { await db.doc(`members/${uid}`).update({ lastLoginAt: Date.now() }); } catch (e) { /* view-only or missing */ }
          const sess = { uid, ...publicProfile(a), location: profileLocation(a), store: "cloud" };
          setSession(sess);
          return { ok: true, session: sess };
        }
      } catch (e) { /* fall through to local */ }
    }
    const list = localList();
    const m = list.find((x) => x.email === email);
    if (!m) return { error: "au_err_none" };
    if (m.hash !== hash) return { error: "au_err_wrong" };
    saveLocal(list.map((x) => (x.id === m.id ? { ...x, lastLoginAt: Date.now() } : x)));
    const sess = { uid: m.id, ...publicProfile(m), location: profileLocation(m), store: "local" };
    setSession(sess);
    return { ok: true, session: sess };
  };

  const resetPassword = async (emailRaw, password) => {
    const email = cleanEmail(emailRaw);
    if (mode === "firebase" && !localList().some((x) => x.email === email)) {
      try { await fbResetPassword(email); return { ok: true, emailSent: true }; }
      catch (e) {
        const code = e && e.code;
        if (code === "auth/user-not-found") return { error: "au_err_none" };
        if (code === "auth/invalid-email") return { error: "au_err_email" };
        return { error: "au_err_generic" };
      }
    }
    if (!password) return { error: "au_err_pass" };
    const hash = await hashPassword(email, password);
    if (mode === "cloud") {
      const { db, uid } = ref.current;
      try {
        const accRef = db.doc(`data/users/${uid}/account`);
        const snap = await accRef.get();
        if (snap.exists && snap.data().email === email) { await accRef.update({ hash }); return { ok: true }; }
      } catch (e) { /* fall through */ }
    }
    const list = localList();
    if (!list.some((x) => x.email === email)) return { error: "au_err_none" };
    saveLocal(list.map((x) => (x.email === email ? { ...x, hash } : x)));
    return { ok: true };
  };

  // Phone OTP (Firebase only). Step 1 sends the SMS, step 2 checks the code and saves the profile.
  const phoneRef = useRef(null);
  const phoneCode = (e) => {
    const code = e && e.code;
    if (code === "auth/invalid-phone-number") return "err_phone";
    if (code === "auth/invalid-verification-code" || code === "auth/code-expired") return "au_otp_wrong";
    if (code === "auth/too-many-requests" || code === "auth/quota-exceeded") return "au_otp_limit";
    return "au_phone_off"; // provider off, Spark plan (no SMS), domain not authorised, or offline
  };
  const startPhone = async (rawPhone) => {
    const e164 = toE164PK(rawPhone);
    if (!e164) return { error: "err_phone" };
    try { phoneRef.current = await fbStartPhone(e164, "au-recaptcha"); return { ok: true, phone: e164 }; }
    catch (e) { console.warn("[Agri-Share] Phone OTP failed:", e && e.code); return { error: phoneCode(e) }; }
  };
  const confirmPhone = async (code, form, isSignup) => {
    if (!phoneRef.current) return { error: "au_otp_wrong" };
    try {
      const user = await fbConfirmPhone(phoneRef.current, String(code).trim());
      let prof = null;
      try { prof = await withTimeout(readDoc(COL.users, user.uid), 1500, null); } catch (e) { /* offline */ }
      const phone = phoneLocal(user.phoneNumber);
      let p;
      if (isSignup || !prof) {
        const loc = (form && form.location) || DEFAULT_LOC;
        p = { ...(prof || {}), name: (form && form.name && form.name.trim()) || (prof && prof.name) || phone, email: (prof && prof.email) || "", phone, role: (form && form.role) || (prof && prof.role) || "renter", country: loc.country || locCountry(loc), district: loc.district, province: loc.province, village: loc.village || "", lat: loc.lat, lng: loc.lng, createdAt: (prof && prof.createdAt) || Date.now() };
      } else p = prof;
      bgWrite(COL.users, user.uid, { ...publicProfile(p), authMethod: "phone", lastLoginAt: Date.now() });
      const sess = { uid: user.uid, ...publicProfile(p), location: profileLocation(p), store: "firebase" };
      setSession(sess);
      phoneRef.current = null;
      return { ok: true, session: sess };
    } catch (e) { return { error: phoneCode(e) }; }
  };
  const phoneAuth = mode === "firebase";

  const signOut = () => { setSession(null); if (mode === "firebase") fbSignOut(); };
  // Firebase reset sends an email link, so the reset form only needs the email address
  const resetByEmail = mode === "firebase";

  return { mode, session, isAdmin, isFounder, fbReady, cloudOwner, fbUser, teamEmails, refreshFbUser, members, membersState, signUp, signIn, resetPassword, signOut, fbUid, resetByEmail, phoneAuth, startPhone, confirmPhone };
}

function AuthModal({ t, dn, lang, initialTab, reason, accounts, onClose, onDone }) {
  const [tab, setTab] = useState(initialTab || "signin");
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", password2: "", role: "renter", location: null, consent: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [method, setMethod] = useState("email"); // email | phone
  const [otpSent, setOtpSent] = useState(null); // phone number the code went to
  const [otp, setOtp] = useState("");
  const dialogRef = useRef(null);
  const set = (k) => (e) => { setServerErr(""); setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value })); };

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const first = dialogRef.current && dialogRef.current.querySelector("input");
    if (first) first.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, tab]);

  const validate = () => {
    const e = {};
    if (method === "phone" && tab !== "reset") {
      if (tab === "signup" && f.name.trim().length < 2) e.name = t("au_err_name");
      if (!toE164PK(f.phone)) e.phone = t("err_phone");
      if (otpSent && !/^\d{6}$/.test(otp.trim())) e.otp = t("au_otp_err");
      if (tab === "signup" && !f.location) e.location = t("loc_err");
      if (tab === "signup" && !f.consent) e.consent = t("au_err_consent");
      return e;
    }
    if (tab === "signup" && f.name.trim().length < 2) e.name = t("au_err_name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = t("au_err_email");
    if (tab === "signup" && f.phone.trim() && !/^03\d{9}$/.test(f.phone.replace(/[\s-]/g, ""))) e.phone = t("err_phone");
    const emailReset = tab === "reset" && accounts.resetByEmail;
    if (!emailReset && f.password.length < 6) e.password = t("au_err_pass");
    if (!emailReset && tab !== "signin" && f.password !== f.password2) e.password2 = t("au_err_pass2");
    if (tab === "signup" && !f.location) e.location = t("loc_err");
    if (tab === "signup" && !f.consent) e.consent = t("au_err_consent");
    return e;
  };
  const errors = tried ? validate() : {};
  const switchTab = (k) => { setTab(k); setTried(false); setServerErr(""); setOtpSent(null); setOtp(""); if (k === "reset") setMethod("email"); };
  const switchMethod = (m) => { setMethod(m); setTried(false); setServerErr(""); setOtpSent(null); setOtp(""); };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validate()).length || busy) return;
    setBusy(true);
    let r;
    if (method === "phone" && tab !== "reset") {
      try {
        if (!otpSent) {
          r = await accounts.startPhone(f.phone);
          setBusy(false);
          if (r.error) { setServerErr(t(r.error)); return; }
          setOtpSent(r.phone); setTried(false); return;
        }
        r = await accounts.confirmPhone(otp, f, tab === "signup");
      } catch (err) { r = { error: "au_phone_off" }; }
      setBusy(false);
      if (r.error) { setServerErr(t(r.error)); return; }
      onDone({ type: tab, session: r.session });
      return;
    }
    try {
      if (tab === "signup") r = await accounts.signUp({ ...f, phone: f.phone.replace(/[\s-]/g, "") });
      else if (tab === "signin") r = await accounts.signIn(f.email, f.password);
      else r = await accounts.resetPassword(f.email, f.password);
    } catch (err) { r = { error: "au_err_generic" }; }
    setBusy(false);
    if (r.error) { setServerErr(t(r.error)); return; }
    if (tab === "reset") { onDone({ type: "reset", emailSent: r.emailSent }); switchTab("signin"); setF((s) => ({ ...s, password: "", password2: "" })); return; }
    onDone({ type: tab, session: r.session, localOnly: r.localOnly });
  };

  const title = tab === "signup" ? t("au_title_up") : tab === "reset" ? t("au_title_reset") : t("au_title_in");
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-soil/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="au-h" className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ivory shadow-2xl sm:rounded-3xl">
        <div className="relative bg-forest px-6 pb-5 pt-6 text-ivory">
          <button onClick={onClose} className="absolute end-3 top-3 rounded-lg p-2 hover:bg-ivory/10" aria-label={t("close")}><X className="h-5 w-5" /></button>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-ivory p-1"><Logo className="h-11 w-11" /></span>
            <div>
              <h2 id="au-h" className="font-display text-xl font-extrabold">{title}</h2>
              <p className="text-sm text-ivory/75">{reason || t("au_sub")}</p>
            </div>
          </div>
          {tab !== "reset" && (
            <div className="mt-5 grid grid-cols-2 rounded-xl bg-ivory/10 p-1" role="tablist">
              {[["signin", t("auth_signin"), LogIn], ["signup", t("auth_signup"), UserPlus]].map(([k, l, Icon]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold ${tab === k ? "bg-ivory text-forest" : "text-ivory/80 hover:text-ivory"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{l}
                </button>
              ))}
            </div>
          )}
        </div>
        <form onSubmit={submit} noValidate className="space-y-4 p-6">
          {accounts.phoneAuth && tab !== "reset" && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-soil/5 p-1" role="radiogroup" aria-label={t("au_method")}>
              {[["email", t("au_m_email"), Mail], ["phone", t("au_m_phone"), Smartphone]].map(([k, l, Icon]) => (
                <button type="button" key={k} role="radio" aria-checked={method === k} onClick={() => switchMethod(k)}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold ${method === k ? "bg-white text-forest shadow-sm ring-1 ring-forest/20" : "text-soil/80 hover:text-soil"}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />{l}
                </button>
              ))}
            </div>
          )}
          {tab === "signup" && (
            <Field label={t("au_name")} htmlFor="au-name" error={errors.name}>
              <input id="au-name" value={f.name} onChange={set("name")} className={inputCls} autoComplete="name" />
            </Field>
          )}
          {method === "phone" && tab !== "reset" && (
            <div className="space-y-3">
              <Field label={t("au_phone")} htmlFor="au-phone-otp" error={errors.phone} hint={t("au_phone_hint")}>
                <input id="au-phone-otp" inputMode="tel" dir="ltr" placeholder="03XX XXXXXXX" value={f.phone} onChange={(e) => { set("phone")(e); setOtpSent(null); setOtp(""); }} className={inputCls} autoComplete="tel" disabled={busy} />
              </Field>
              {otpSent && (
                <Field label={t("au_otp").replace("{phone}", phoneLocal(otpSent))} htmlFor="au-otp" error={errors.otp}>
                  <input id="au-otp" inputMode="numeric" dir="ltr" maxLength={6} autoComplete="one-time-code" value={otp} onChange={(e) => { setServerErr(""); setOtp(e.target.value.replace(/\D/g, "")); }} className={inputCls + " text-center text-xl font-extrabold tracking-[0.5em]"} placeholder="••••••" />
                </Field>
              )}
              {otpSent && <button type="button" onClick={() => { setOtpSent(null); setOtp(""); }} className="text-xs font-semibold text-forest underline-offset-2 hover:underline">{t("au_otp_resend")}</button>}
              <div id="au-recaptcha" />
            </div>
          )}
          {!(method === "phone" && tab !== "reset") && <>
          <Field label={t("au_email")} htmlFor="au-email" error={errors.email}>
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soil/80" aria-hidden="true" />
              <input id="au-email" type="email" dir="ltr" value={f.email} onChange={set("email")} placeholder="name@example.com" className={inputCls + " ps-9"} autoComplete="email" />
            </div>
          </Field>
          </>}
          {tab === "signup" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {method !== "phone" && <Field label={t("au_phone")} htmlFor="au-phone" error={errors.phone}>
                <input id="au-phone" inputMode="tel" dir="ltr" placeholder="03XX XXXXXXX" value={f.phone} onChange={set("phone")} className={inputCls} autoComplete="tel" />
              </Field>}
              <div className="sm:col-span-2"><LocationField t={t} lang={lang} id="au-loc" label={t("loc_farm")} value={f.location} onChange={(location) => { setServerErr(""); setF((s) => ({ ...s, location })); }} error={errors.location} /></div>
            </div>
          )}
          {tab === "signup" && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-soil">{t("au_role")}</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["renter", t("role_renter"), Sprout], ["owner", t("role_owner"), Tractor], ["buyer", t("role_buyer"), Wheat], ["agent", t("role_agent"), Store]].map(([v, l, Icon]) => (
                  <label key={v} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2.5 text-center text-xs font-bold ${f.role === v ? "border-forest bg-forest/5 text-forest" : "border-soil/15 bg-white text-soil"}`}>
                    <input type="radio" name="role" value={v} checked={f.role === v} onChange={set("role")} className="sr-only" />
                    <Icon className="h-5 w-5" aria-hidden="true" />{l}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {!(tab === "reset" && accounts.resetByEmail) && !(method === "phone" && tab !== "reset") && <>
          <Field label={tab === "reset" ? t("au_reset_btn") : t("au_pass")} htmlFor="au-pass" error={errors.password}>
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soil/80" aria-hidden="true" />
              <input id="au-pass" type={showPass ? "text" : "password"} dir="ltr" value={f.password} onChange={set("password")} className={inputCls + " pe-10 ps-9"} autoComplete={tab === "signin" ? "current-password" : "new-password"} />
              <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-soil/80 hover:text-soil" aria-label={showPass ? "Hide password" : "Show password"}>
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          {tab !== "signin" && (
            <Field label={t("au_pass2")} htmlFor="au-pass2" error={errors.password2}>
              <input id="au-pass2" type={showPass ? "text" : "password"} dir="ltr" value={f.password2} onChange={set("password2")} className={inputCls} autoComplete="new-password" />
            </Field>
          )}
          </>}
          {tab === "signup" && (
            <div>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${errors.consent ? "border-red-400 bg-red-50" : "border-soil/15 bg-white"}`}>
                <input type="checkbox" checked={f.consent} onChange={set("consent")} className="mt-0.5 h-4 w-4 shrink-0 accent-forest" />
                <span className="text-soil">{t("au_consent")}</span>
              </label>
              {errors.consent && <p className="mt-1 text-xs font-medium text-red-700">{errors.consent}</p>}
            </div>
          )}
          {tab === "reset" && <p className="rounded-xl bg-gold/15 p-3 text-xs text-soil">{t(accounts.resetByEmail ? "au_reset_email_note" : "au_reset_note")}</p>}
          {serverErr && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{serverErr}</p>}
          <button type="submit" disabled={busy || accounts.mode === "loading"} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-forest px-4 py-3 text-sm font-bold text-ivory hover:bg-[#0f4a28] disabled:opacity-60">
            {tab === "signup" ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : tab === "reset" ? <KeyRound className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {busy ? "..." : method === "phone" && tab !== "reset" ? (otpSent ? t("au_otp_verify") : t("au_otp_send")) : tab === "signup" ? t("au_create") : tab === "reset" ? t("au_reset_btn") : t("au_login")}
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {tab === "signin" && <button type="button" onClick={() => switchTab("reset")} className="font-semibold text-forest underline-offset-2 hover:underline">{t("au_forgot")}</button>}
            {tab === "signin" && <button type="button" onClick={() => switchTab("signup")} className="text-soil/80">{t("au_new")} <b className="text-forest">{t("auth_signup")}</b></button>}
            {tab === "signup" && <button type="button" onClick={() => switchTab("signin")} className="text-soil/80">{t("au_have")} <b className="text-forest">{t("auth_signin")}</b></button>}
            {tab === "reset" && <button type="button" onClick={() => switchTab("signin")} className="font-semibold text-forest">{t("au_back")}</button>}
          </div>
          {accounts.mode === "local" && <p className="flex items-center gap-1.5 text-[11px] text-soil/80"><Database className="h-3.5 w-3.5" aria-hidden="true" />{t("au_local_note")}</p>}
        </form>
      </div>
    </div>
  );
}

function AccountMenu({ t, session, onSignIn, onSignUp, onSignOut }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!session) {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={onSignIn} className="inline-flex items-center gap-1.5 rounded-xl border border-forest/15 bg-white px-2.5 py-2 text-sm font-bold text-forest hover:bg-forest/5"><LogIn className="h-4 w-4" aria-hidden="true" /><span className="text-xs sm:text-sm">{t("auth_signin")}</span></button>
        <button onClick={onSignUp} className="hidden items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-sm font-bold text-soil hover:brightness-105 sm:inline-flex"><UserPlus className="h-4 w-4" aria-hidden="true" />{t("auth_signup")}</button>
      </div>
    );
  }
  const initials = session.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 rounded-xl border border-forest/15 bg-white py-1 pe-2 ps-1 text-sm font-bold text-forest">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-forest text-xs text-gold" aria-hidden="true">{initials}</span>
        <span className="hidden max-w-[110px] truncate md:inline">{session.name.split(" ")[0]}</span>
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-2 w-64 rounded-2xl border border-soil/10 bg-white p-3 shadow-xl">
          <p className="font-bold text-forest">{session.name}</p>
          <p className="truncate text-sm text-soil/80" dir="ltr">{session.email}</p>
          <p className="mt-1 inline-flex rounded-full bg-leaf/15 px-2 py-0.5 text-xs font-bold text-forest">{t("role_" + session.role)}</p>
          <button onClick={() => { setOpen(false); onSignOut(); }} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-soil/15 px-3 py-2 text-sm font-bold text-soil hover:bg-ivory">
            <LogOut className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />{t("auth_signout")}
          </button>
        </div>
      )}
    </div>
  );
}

function MembersAdmin({ t, dn, accounts, toast, embedded }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...accounts.members]
      .filter((m) => !needle || [m.name, m.email, m.district, m.role].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [accounts.members, q]);
  const counts = ["renter", "owner", "buyer", "agent"].map((r) => [r, accounts.members.filter((m) => m.role === r).length]);
  const when = (ms) => (ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "·");
  const copyCsv = async () => {
    const rows = [["Name", "Email", "Mobile", "Role", "District", "Joined"], ...list.map((m) => [m.name, m.email, m.phone || "", m.role, m.district, when(m.createdAt)])];
    const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    try { await navigator.clipboard.writeText(csv); toast(t("mem_copied")); } catch (e) { toast("Copy is not allowed here."); }
  };
  return (
    <section className={embedded ? "" : "mx-auto max-w-7xl px-4 py-8 sm:px-6"} aria-labelledby="mem-h">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="mem-h" className="font-display text-2xl font-extrabold text-forest">{t("mem_title")}</h2>
          <p className="mt-1 text-sm text-soil/80">{t("mem_sub")}</p>
        </div>
        <button onClick={copyCsv} disabled={!list.length} className="inline-flex items-center gap-2 rounded-xl border border-forest/20 bg-white px-3 py-2 text-sm font-bold text-forest disabled:opacity-40"><Copy className="h-4 w-4" aria-hidden="true" />{t("mem_copy")}</button>
      </div>
      <p className={`mb-4 flex items-center gap-2 rounded-xl p-3 text-sm ${accounts.mode === "cloud" ? "bg-leaf/10 text-forest" : "bg-gold/15 text-soil"}`}>
        {accounts.mode === "cloud" ? <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Database className="h-4 w-4 shrink-0" aria-hidden="true" />}
        {accounts.mode === "cloud" ? t("mem_cloud") : t("mem_local")}
      </p>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-forest p-4 text-ivory"><p className="text-xs text-ivory/80">{t("mem_total")}</p><p className="font-display text-3xl font-extrabold text-gold">{accounts.members.length}</p></div>
        {counts.map(([r, n]) => (
          <div key={r} className="rounded-2xl bg-white p-4 ring-1 ring-soil/10"><p className="text-xs text-soil/80">{t("role_" + r)}</p><p className="font-display text-3xl font-extrabold text-forest">{n}</p></div>
        ))}
      </div>
      <div className="rounded-2xl border border-soil/10 bg-white shadow-sm">
        <div className="border-b border-soil/10 p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-soil/80" aria-hidden="true" />
            <label htmlFor="mem-q" className="sr-only">{t("mem_search")}</label>
            <input id="mem-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("mem_search")} className={inputCls + " ps-9"} />
          </div>
        </div>
        {(accounts.membersState === "loading" || accounts.membersState === "slow") && !accounts.members.length ? (
          <p className="p-6 text-sm text-soil/80">{accounts.membersState === "slow" ? t("mem_slow") : t("mem_loading")}</p>
        ) : list.length === 0 ? (
          <p className="p-6 text-center text-sm text-soil/80">{t("mem_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ivory text-start text-xs uppercase tracking-wide text-soil/80">
                <tr>{[t("au_name"), t("au_email"), t("au_phone"), t("au_role"), t("au_district"), t("mem_joined"), t("mem_last")].map((h) => <th key={h} className="px-4 py-2.5 text-start font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-soil/10">
                {list.map((m) => (
                  <tr key={m.id} className="hover:bg-ivory/60">
                    <td className="px-4 py-3 font-semibold text-forest">{m.name}</td>
                    <td className="px-4 py-3" dir="ltr"><a href={`mailto:${m.email}`} className="text-soil underline-offset-2 hover:underline">{m.email}</a></td>
                    <td className="px-4 py-3" dir="ltr">{m.phone || "·"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-leaf/15 px-2 py-0.5 text-xs font-bold text-forest">{t("role_" + m.role)}</span></td>
                    <td className="px-4 py-3">{[m.village, dn(m.district)].filter(Boolean).join(", ")}{m.province ? <span className="block text-[11px] text-soil/80">{provName("en", m.province)}</span> : null}</td>
                    <td className="px-4 py-3 text-xs text-soil/80" dir="ltr">{when(m.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-soil/80" dir="ltr">{when(m.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */
const FOOTER_INFO = {
  how: {
    title: "How It Works",
    body: [
      "Farmers search nearby machines or post a request with the hourly rate they want to pay.",
      "Verified owners respond. You see the full cost before you agree: rent, transport, diesel and the platform fee.",
      "Confirm the booking and pay with EasyPaisa, JazzCash or cash through your Agri-Agent. Rate the owner after the job.",
      "Owners list machines from the Owner Portal. Every listing is reviewed by the Agri-Share team before it goes live.",
    ],
  },
  safety: {
    title: "Safety & Escrow Policy",
    body: [
      "Every machine listing is reviewed before it appears in the marketplace.",
      "Each booking has a booking ID and verification badge. Check both with the owner at hand-over.",
      "Agree hours, rate and fuel terms in the app before work starts, so both sides have the same record.",
      "Escrow (holding your payment until the job is done) is being introduced with our payment partners. Where it is not yet available, pay the owner only after the machine arrives and work begins.",
      "Problems with a booking? Contact support within 48 hours with your booking ID.",
    ],
  },
  agent: {
    title: "Become an Agri-Agent",
    body: [
      "Agri-Agents are village shopkeepers and community members who book machines for farmers without smartphones.",
      "Agents search the marketplace, submit bookings on a farmer's behalf and help with cash payments.",
      "Agents earn a commission on every completed booking. Call 0800-AGRI-1 or open the Agri-Agent & USSD tab to get started.",
    ],
  },
};

function Footer({ t, setTab }) {
  const [info, setInfo] = useState(null);
  const links = [["how", ClipboardList], ["safety", ShieldCheck], ["agent", Handshake]];
  return (
    <footer className="mt-8 w-full bg-[#4A3219] pb-28 text-ivory lg:pb-12" dir="ltr">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.1fr_1.4fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-ivory p-1.5"><Logo className="h-12 w-12" /></span>
            <div>
              <p className="font-display text-xl font-extrabold">Agri<span className="text-gold">-</span>Share</p>
              <p className="text-sm italic text-ivory/75">Sharing Resources, Growing Together</p>
            </div>
          </div>
          <p className="mt-4 max-w-sm text-sm text-ivory/80">Agri-Share is a peer-to-peer agricultural machinery rental and crop marketplace connecting farmers, machinery owners, and bulk buyers across Pakistan and beyond.</p>
        </div>
        <nav className="grid gap-2 sm:grid-cols-2" aria-label="Agri-Share">
          {links.map(([k, Icon]) => (
            <button key={k} type="button" onClick={() => setInfo(k)} className="flex items-center gap-3 rounded-2xl bg-ivory/5 p-4 text-start text-sm font-bold ring-1 ring-ivory/10 transition hover:bg-ivory/10">
              <Icon className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />{FOOTER_INFO[k].title}
            </button>
          ))}
          <a href="tel:080024741" className="flex items-center gap-3 rounded-2xl bg-gold/15 p-4 text-sm font-bold ring-1 ring-gold/40 transition hover:bg-gold/25">
            <Headphones className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" /><span>Support & Helpline: <span className="font-mono">0800-AGRI-1</span></span>
          </a>
        </nav>
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-6 text-[11px] leading-relaxed text-ivory/80 sm:px-6">
        <p className="mb-1 flex items-center gap-1.5 font-bold uppercase tracking-wide text-ivory/75"><Camera className="h-3.5 w-3.5" aria-hidden="true" />Machine photo credits (Wikimedia Commons)</p>
        <p>
          {Object.values(MACHINE_PHOTOS).map((ph, i) => (
            <span key={ph.file}>{i ? " · " : ""}<a href={commonsPage(ph.file)} target="_blank" rel="noopener noreferrer" className="underline decoration-ivory/30 underline-offset-2 hover:text-ivory">{ph.label}</a> ({ph.credit})</span>
          ))}
          . Photos show the machine type, not always the exact model listed. Currencies are converted at reference rates (1 USD ≈ {USD_PKR} PKR ≈ 6.67 CNY ≈ 94 INR, Nov 2026).
        </p>
      </div>
      <div className="border-t border-ivory/10 py-4 text-center text-xs text-ivory/80">© 2026 Agri-Share Technologies. All rights reserved.</div>
      {info && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-soil/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setInfo(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="ft-h" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ivory p-6 text-soil shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="ft-h" className="font-display text-xl font-extrabold text-forest">{FOOTER_INFO[info].title}</h2>
              <button type="button" onClick={() => setInfo(null)} className="rounded-lg p-1.5 hover:bg-soil/10" aria-label={t("close")}><X className="h-5 w-5" /></button>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {FOOTER_INFO[info].body.map((line) => <li key={line} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-leafink" aria-hidden="true" />{line}</li>)}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              {info === "agent" && setTab && <button type="button" onClick={() => { setInfo(null); setTab("agri-agent"); }} className="rounded-xl bg-forest px-4 py-2 text-sm font-bold text-ivory">Open Agri-Agent & USSD</button>}
              <a href="tel:080024741" className="inline-flex items-center gap-2 rounded-xl border border-soil/20 px-4 py-2 text-sm font-bold text-forest"><Phone className="h-4 w-4" aria-hidden="true" />0800-AGRI-1</a>
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}


/* ------------------------------------------------------------------ */
/* Live Firestore sync                                                 */
/* Every collection keeps a localStorage copy on this device. When     */
/* Firestore answers, each document is merged both ways and kept live  */
/* with onSnapshot. If the rules refuse a request or the network is    */
/* down, the app simply carries on with the local copy.                */
/* ------------------------------------------------------------------ */
const sortKeys = (v) => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") { const o = {}; Object.keys(v).sort().forEach((k) => { if (v[k] !== undefined && typeof v[k] !== "function") o[k] = sortKeys(v[k]); }); return o; }
  return typeof v === "number" && !Number.isFinite(v) ? null : v;
};
const stableJson = (v) => JSON.stringify(sortKeys(v));
const docKey = (id) => String(id).replace(/\//g, "_");

function useCollectionSync(key, items, setItems, authUid, report) {
  const synced = useRef(null); // Map id -> json last seen in (or sent to) Firestore; null until the server answers
  const failed = useRef(new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const name = COL[key];

  const push = (it) => {
    const id = docKey(it.id);
    const json = stableJson(it);
    if (synced.current) synced.current.set(id, json);
    writeDoc(name, id, it).catch((e) => {
      if (synced.current) synced.current.delete(id);
      console.warn(`[Agri-Share] Firestore write ${name}/${id} failed:`, e && e.code, e && e.message);
      if (e && e.code === "permission-denied") { failed.current.add(id); report(key, "denied", "permission-denied (write)"); }
      else report(key, syncState(e), (e && e.code) || "write-failed");
    });
  };

  useEffect(() => {
    if (!FIREBASE_ENABLED) { report(key, "local"); return undefined; }
    synced.current = null; failed.current = new Set();
    report(key, "connecting");
    const slow = setTimeout(() => { if (synced.current === null) report(key, "offline", `no server response after 9s (database "${FIRESTORE_DATABASE_ID}")`); }, 9000);
    const knownKey = "agrishare.cloudIds." + key;
    const unsub = watchCollection(name, (list, meta) => {
      if (meta.fromCache && synced.current === null) return; // wait for the server's answer first
      const remote = new Map(list.map((d) => [docKey(d.id), d]));
      const known = new Set(store.get(knownKey, []));
      const prev = synced.current || new Map();
      const next = [];
      const toPush = [];
      const seen = new Set();
      itemsRef.current.forEach((it) => {
        const id = docKey(it.id);
        seen.add(id);
        const r = remote.get(id);
        if (r) {
          const localJson = stableJson(it);
          // edited here but not uploaded yet: keep ours and send it
          if (prev.has(id) && localJson !== prev.get(id) && !failed.current.has(id)) { next.push(it); toPush.push(it); }
          else next.push(r);
        } else if (failed.current.has(id)) {
          next.push(it); // the rules refused it: keep it on this device
        } else if (!prev.has(id) && !known.has(id)) {
          next.push(it); toPush.push(it); // new on this device: upload
        } // else: deleted on another device, drop it here too
      });
      list.forEach((d) => { if (!seen.has(docKey(d.id))) next.push(d); });
      const map = new Map();
      remote.forEach((d, id) => map.set(id, stableJson(d)));
      synced.current = map;
      if (!meta.fromCache) store.set(knownKey, [...remote.keys()]);
      if (stableJson(next) !== stableJson(itemsRef.current)) setItems(next);
      toPush.forEach(push);
      report(key, failed.current.size ? "denied" : meta.fromCache ? "offline" : "live", failed.current.size ? "permission-denied (write)" : "");
    }, (err) => { synced.current = null; report(key, syncState(err), (err && (err.code || err.message)) || "error"); });
    return () => { clearTimeout(slow); unsub(); };
  }, [authUid]); // eslint-disable-line

  // Send local changes (new, edited, deleted) to Firestore
  useEffect(() => {
    const map = synced.current;
    if (!FIREBASE_ENABLED || !map) return;
    const ids = new Set();
    items.forEach((it) => {
      const id = docKey(it.id);
      ids.add(id);
      if (failed.current.has(id)) return;
      if (map.get(id) !== stableJson(it)) push(it);
    });
    [...map.keys()].forEach((id) => {
      if (!ids.has(id)) { map.delete(id); removeDoc(name, id).catch(() => {}); }
    });
  }, [items]); // eslint-disable-line
}

function useSettingsSync(settings, setSettings, authUid, report) {
  const synced = useRef(null);
  const ref = useRef(settings);
  ref.current = settings;
  const save = (v) => {
    synced.current = stableJson(v);
    writeDoc(COL.settings, "pilot", { ...v, updatedAt: Date.now() }).catch((e) => { if (e && e.code === "permission-denied") report("settings", "denied", "permission-denied (write: admins only)"); });
  };
  useEffect(() => {
    if (!FIREBASE_ENABLED) { report("settings", "local"); return undefined; }
    synced.current = null;
    report("settings", "connecting");
    const slow = setTimeout(() => { if (synced.current === null) report("settings", "offline", `no server response after 9s (database "${FIRESTORE_DATABASE_ID}")`); }, 9000);
    const unsub = watchDoc(COL.settings, "pilot", (data, meta) => {
      if (meta.fromCache && synced.current === null) return;
      if (!data) { if (!meta.fromCache) save(ref.current); report("settings", "live"); return; }
      const { updatedAt, ...rest } = data;
      const merged = { ...ref.current, ...rest };
      synced.current = stableJson(merged);
      if (stableJson(merged) !== stableJson(ref.current)) setSettings(merged);
      report("settings", meta.fromCache ? "offline" : "live");
    }, (err) => { synced.current = null; report("settings", syncState(err), (err && (err.code || err.message)) || "error"); });
    return () => { clearTimeout(slow); unsub(); };
  }, [authUid]); // eslint-disable-line
  useEffect(() => {
    if (!FIREBASE_ENABLED || synced.current === null) return;
    if (stableJson(settings) !== synced.current) save(settings);
  }, [settings]); // eslint-disable-line
}

// Firestore error -> sync state shown in the badge
const syncState = (err) => {
  const c = err && err.code;
  if (c === "permission-denied") return "denied";
  if (c === "not-found" || (err && /database .* does not exist|NOT_FOUND/i.test(err.message || ""))) return "nodb";
  if (c === "unavailable" || c === "deadline-exceeded") return "offline";
  return "local";
};

function useCloudSync(state, setters, authUid) {
  const [status, setStatus] = useState({});
  const [codes, setCodes] = useState({});
  const report = useCallback((k, v, code) => {
    setStatus((s) => (s[k] === v ? s : { ...s, [k]: v }));
    setCodes((c) => ((c[k] || "") === (code || "") ? c : { ...c, [k]: code || "" }));
    if (code) console.warn(`[Agri-Share] Firestore ${k}: ${v} (${code})`);
  }, []);
  useCollectionSync("listings", state.listings, setters.setListings, authUid, report);
  useCollectionSync("bookings", state.bookings, setters.setBookings, authUid, report);
  useCollectionSync("requests", state.liveRequests, setters.setLiveRequests, authUid, report);
  useCollectionSync("mandi", state.mandiPosts, setters.setMandiPosts, authUid, report);
  useCollectionSync("demand", state.demand, setters.setDemand, authUid, report);
  useSettingsSync(state.settings, setters.setSettings, authUid, report);
  const vals = Object.values(status);
  const overall = !FIREBASE_ENABLED ? "local" : vals.includes("nodb") ? "nodb" : vals.includes("connecting") || vals.length < 6 ? "connecting" : vals.every((v) => v === "live") ? "live" : vals.includes("live") ? "partial" : vals.every((v) => v === "denied") ? "denied" : vals.includes("offline") ? "offline" : "local";
  return { status, codes, overall, databaseId: FIRESTORE_DATABASE_ID };
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const MEMBERS_TAB = { key: "members", label: "nav_members", icon: Users };
const ADMIN_TAB = { key: "admin", label: "nav_admin", icon: ShieldCheck };
const TAB_KEYS = [...TABS.map((x) => x.key), "members", "admin"];
const readHash = () => { const h = (window.location.hash || "").replace("#", ""); return TAB_KEYS.includes(h) ? h : "marketplace"; };

const CUR_LABEL_KEYS = new Set(["am_rate", "bk_offer_rate", "bk_offer_tr", "lr_rate", "ow_counter_rate", "ow_counter_tr", "ow_rate"]);
const CUR_INTL_KEYS = { lr_tier1_t: "lr_tier1_t_intl", lr_tier2_t: "lr_tier2_t_intl", op_optional: "op_optional_intl", tr_optional: "tr_optional_intl" };

function App() {
  const [lang, setLangState] = useState(() => store.get("agrishare.lang", "en"));
  const [tab, setTabState] = useState(readHash);
  const [ownerSub, setOwnerSub] = useState(null);
  // Real listings only. Sample listings are layered on top in Demo mode (see marketListings).
  const [listings, setListings] = useState(() => (store.get("agrishare.listings.v1", []) || []).filter((l) => !isSeedListing(l)));
  // Live Public Mode is the default for everyone; Demo mode is an evaluator switch kept on this device
  const [demoMode, setDemoModeState] = useState(() => store.get("agrishare.demoMode", false) === true);
  const [demand, setDemand] = useState(() => store.get("agrishare.demand.v1", []));
  const [bookings, setBookings] = useState(() => store.get("agrishare.bookings.v1", []));
  const [liveRequests, setLiveRequests] = useState(() => store.get("agrishare.requests.v1", []));
  const [mandiPosts, setMandiPosts] = useState(() => store.get("agrishare.mandi.v1", []));
  const [settings, setSettings] = useState(() => {
    const saved = store.get("agrishare.settings.v1", {});
    const { activeDistricts, ...rest } = saved; // older versions stored pilot districts; provinces replace them
    return { dieselPrice: DIESEL_BENCHMARK, dieselUpdatedAt: null, activeProvinces: PROVINCES, ...rest };
  });
  const [filters, setFilters] = useState({ category: "all", province: "all", radius: DEFAULT_RADIUS, query: "" });
  const [bookingTarget, setBookingTarget] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [helperOpen, setHelperOpen] = useState(false);
  const accounts = useAccounts();
  const session = accounts.session;
  // Renter's farm location (pin, GPS or district). Distances and transport are measured from it.
  const [userLoc, setUserLocState] = useState(() => store.get("agrishare.userloc", null));
  const setUserLoc = (loc) => { setUserLocState(loc); store.set("agrishare.userloc", loc); };
  useEffect(() => { if (!userLoc && session && session.location && locCountry(session.location) === (store.get("agrishare.country", "PK") || "PK")) setUserLoc(session.location); }, [session && session.email]); // eslint-disable-line
  const [auth, setAuth] = useState(null); // { tab, reason, then }

  // Country / region: decides currency, machinery catalog, sample listings and location lists
  const [country, setCountryState] = useState(() => { const c = store.get("agrishare.country", "PK"); return COUNTRIES[c] ? c : "PK"; });
  CUR = COUNTRIES[country] || COUNTRIES.PK; // read by pkr(), catalogs and location pickers during this render
  const setCountry = (cc) => {
    if (!COUNTRIES[cc]) return;
    CUR = COUNTRIES[cc];
    setCountryState(cc); store.set("agrishare.country", cc);
    setFilters((f) => ({ ...f, category: "all", province: "all" }));
    if (!userLoc || locCountry(userLoc) !== cc) setUserLoc(cc === "PK" ? (session && session.location && locCountry(session.location) === "PK" ? session.location : null) : defaultLocFor(cc));
  };

  const langMeta = LANGS.find((l) => l.code === lang) || LANGS[0];
  const tBase = useCallback((key) => (T[lang] && T[lang][key]) || (langMeta.dir === "rtl" && T[RTL_FALLBACK][key]) || T.en[key] || key, [lang, langMeta.dir]);
  // Outside Pakistan: money labels use the local currency and PKR-specific tariffs are worded generally
  const t = useCallback((key) => {
    if (country === "PK") return tBase(key);
    if (CUR_INTL_KEYS[key]) return tBase(CUR_INTL_KEYS[key]);
    const v = tBase(key);
    if (key === "lr_transport") return v.replace("PKR ", "").replace(" روپے", "");
    return CUR_LABEL_KEYS.has(key) ? v.replace(/PKR|روپے/g, CUR.code) : v;
  }, [tBase, country]);
  const dn = useCallback((d) => (DISTRICT_NAMES[lang] && DISTRICT_NAMES[lang][d]) || d, [lang]);

  useEffect(() => { store.set("agrishare.listings.v1", listings); }, [listings]);
  useEffect(() => { store.set("agrishare.bookings.v1", bookings); }, [bookings]);
  useEffect(() => { store.set("agrishare.requests.v1", liveRequests); }, [liveRequests]);
  useEffect(() => { store.set("agrishare.mandi.v1", mandiPosts); }, [mandiPosts]);
  useEffect(() => { store.set("agrishare.settings.v1", settings); }, [settings]);
  useEffect(() => { store.set("agrishare.demand.v1", demand); }, [demand]);

  // Live Firestore sync (falls back to localStorage when Firebase is unreachable or refuses)
  const cloud = useCloudSync({ listings, bookings, liveRequests, settings, mandiPosts, demand }, { setListings, setBookings, setLiveRequests, setSettings, setMandiPosts, setDemand }, accounts.fbUid);
  useEffect(() => {
    store.set("agrishare.lang", lang);
    document.documentElement.lang = langMeta.html || lang;
    document.documentElement.dir = langMeta.dir;
  }, [lang, langMeta.dir]);
  useEffect(() => {
    const onHash = () => setTabState(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // toast(text, { type: success | info | warn | error, title, action: { label, run } })
  const toast = useCallback((text, opts) => {
    const o = opts || {};
    const id = Date.now() + Math.random();
    const ms = o.ms || 4200;
    setToasts((ts) => [...ts.slice(-2), { id, text, ms, type: o.type || "success", title: o.title, action: o.action }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), ms);
  }, []);
  const [voucherId, setVoucherId] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const dismissToast = (id) => setToasts((ts) => ts.filter((x) => x.id !== id));

  const setTab = (key, sub) => {
    setTabState(key);
    if (key === "owner-portal") setOwnerSub(sub || null);
    try { if (window.location.hash !== "#" + key) window.history.replaceState(null, "", "#" + key); } catch (e) { /* sandboxed */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const setLang = (code) => {
    setLangState(code);
    const meta = LANGS.find((l) => l.code === code);
    if (meta && meta.expansion && T[code] && T[code].exp_note) toast(T[code].exp_note);
  };

  const openAuth = (tabName, reason, then) => setAuth({ tab: tabName || "signin", reason, then });
  const requireAuth = (fn) => { if (session) fn(); else openAuth("signup", t("au_need"), fn); };
  const onAuthDone = (r) => {
    if (r.type === "reset") { toast(t(r.emailSent ? "toast_reset_link" : "toast_reset")); return; }
    const then = auth && auth.then;
    setAuth(null);
    toast((r.type === "signup" ? t("toast_registered") : t("toast_welcome").replace("{name}", r.session.name.split(" ")[0])) + (r.localOnly ? " " + t("au_local_note") : ""));
    if (then) setTimeout(then, 0);
  };
  const signOut = () => { accounts.signOut(); toast(t("toast_signedout")); if (tab === "members") setTab("marketplace"); };
  // Admin tab is hidden from everyone except the founder / authorised team emails
  const tabs = [...TABS, ...(accounts.cloudOwner && accounts.mode === "cloud" ? [MEMBERS_TAB] : []), ...(accounts.isAdmin ? [ADMIN_TAB] : [])];
  // Live Public Mode: real owner listings only (sample rows that reached the cloud earlier are hidden too).
  // Demo mode: real listings plus the sample fleet.
  const realListings = useMemo(() => listings.filter((l) => !isSeedListing(l)), [listings]);
  const marketListings = useMemo(() => (demoMode ? [...realListings, ...SEED_LISTINGS.filter((x) => !realListings.some((l) => l.id === x.id))] : realListings), [realListings, demoMode]);
  const setDemoMode = (on) => { setDemoModeState(on); store.set("agrishare.demoMode", on); toast(t(on ? "toast_mode_demo" : "toast_mode_live"), { type: "info" }); };
  const saveDemand = (rec) => setDemand((list) => (list.some((d) => d.id === rec.id) ? list.map((d) => (d.id === rec.id ? { ...d, ...rec } : d)) : [...list, rec]));
  // Only admin-approved machines in switched-on pilot districts are visible to renters
  const publicListings = useMemo(() => marketListings
    .filter((l) => (l.status || "approved") === "approved" && (l.country || "PK") === country && (country !== "PK" || settings.activeProvinces.includes(l.province || "PB")))
    .map((l) => (userLoc && l.lat && locCountry(userLoc) === country ? { ...l, distance: Math.max(0.5, roadKm(userLoc, l)), fromPin: true } : l)),
  [marketListings, settings.activeProvinces, userLoc, country]);
  // Diesel: admin-set national rate in Pakistan, indicative local price elsewhere (stored in PKR)
  const dieselPrice = country === "PK" ? settings.dieselPrice : CUR.diesel / CUR.fx;
  const saveMandi = (patch) => setMandiPosts((list) => (list.some((r) => r.id === patch.id) ? list.map((r) => (r.id === patch.id ? { ...r, ...patch } : r)) : [...list, patch]));
  const settleFinancing = (ids, saleId) => {
    if (!ids.length) return;
    setBookings((bs) => bs.map((b) => (ids.includes(b.id) && b.financing ? { ...b, financing: { ...b.financing, status: "settled", settledBy: saleId, settledAt: Date.now() } } : b)));
  };
  const saveRequest = (patch) => setLiveRequests((list) => (list.some((r) => r.id === patch.id) ? list.map((r) => (r.id === patch.id ? { ...r, ...patch } : r)) : [...list, patch]));
  const setListingStatus = (id, status) => {
    setListings((ls) => ls.map((l) => (l.id === id ? { ...l, status, reviewedAt: Date.now() } : l)));
    toast(t(status === "approved" ? "toast_approved" : "toast_rejected"));
  };
  const resetDemo = () => {
    setListings((ls) => ls.filter((l) => !isSeedListing(l))); setBookings([]); setLiveRequests([]); setMandiPosts([]);
    setSettings({ dieselPrice: DIESEL_BENCHMARK, dieselUpdatedAt: null, activeProvinces: PROVINCES });
    toast(t("toast_demo_reset"));
  };

  const createBooking = (listing, details, silent) => {
    const id = newBookingId();
    const now = Date.now();
    const b = {
      id, listingId: listing.id, listingName: listing.name, category: listing.category, district: listing.district, ownerId: listing.ownerId,
      date: details.date, hours: details.quote.hours, operator: details.operator, transport: details.transport, quote: details.quote, payment: details.payment,
      renterName: details.renterName, renterPhone: details.renterPhone, channel: details.channel || "app", status: details.status || "sent", createdAt: now, history: [{ status: details.status || "sent", at: now }],
      renterEmail: details.channel === "ussd" ? null : session ? session.email : null, offer: details.offer || null,
      smallholder: !!details.smallholder, financing: details.financing || null,
      listingSnap: { rate: listing.rate, operator: listing.operator, transport: listing.transport, distance: listing.distance },
    };
    setBookings((bs) => [...bs, b]);
    const sync = cloud.overall === "live" || cloud.overall === "partial" ? t("toast_synced") : t("toast_local");
    if (!silent) toast((details.offer ? t("toast_offer") : t("toast_booked")) + " " + sync, { title: t(details.offer ? "toast_offer_t" : "toast_booked_t"), action: { label: t("act_view_voucher"), run: () => setVoucherId(id) } });
    return id;
  };

  const updateBooking = (id, status, extra, silent) => {
    setBookings((bs) => bs.map((b) => (b.id === id ? { ...b, ...(extra || {}), status, history: [...(b.history || []), { status, at: Date.now() }] } : b)));
    if (!silent) toast(t({ confirmed: "toast_confirmed", declined: "toast_declined", completed: "toast_completed", feedback: "toast_feedback", cancelled: "toast_cancelled", countered: "toast_countered" }[status]));
  };

  const addListing = (f) => {
    const l = { ...f, id: "U" + Date.now(), ownerId: "AS-" + Math.floor(2000 + Math.random() * 7000), rating: 5.0, available: true, mine: true, status: "pending", submittedAt: Date.now(), ownerEmail: session ? session.email : null };
    setListings((ls) => [...ls, l]);
    setFilters((fl) => ({ ...fl, radius: Math.max(fl.radius, Math.ceil(l.distance)) }));
    toast(t("toast_listed"));
    // cold start: tell the new owner about farmers already waiting for this machine in their district
    const waiting = demand.filter((d) => d.status === "waiting" && d.category === l.category && (!l.district || d.district === l.district)).length;
    if (waiting) setTimeout(() => toast(t("toast_waiting").replace("{n}", waiting).replace("{machine}", t("one_" + l.category)).replace("{district}", dn(l.district || "")), { type: "info", title: t("ow_waiting") }), 600);
  };
  const toggleListing = (id) => setListings((ls) => ls.map((l) => (l.id === id ? { ...l, available: !l.available } : l)));
  const removeListing = (id) => { setListings((ls) => ls.filter((l) => l.id !== id)); toast(t("toast_removed")); };

  const pendingCount = bookings.filter((b) => b.status === "sent").length;
  // red Admin badge: machines awaiting approval + open Apni Boli requests + waiting demand tickets
  const adminCount = accounts.isAdmin
    ? realListings.filter((l) => l.status === "pending").length + liveRequests.filter((r) => r.status === "open").length + demand.filter((d) => d.status === "waiting").length
    : 0;
  const mine = (email) => !session || !email || email === session.email;
  const myBookings = [...bookings].filter((b) => b.channel === "ussd" || mine(b.renterEmail)).sort((a, b) => b.createdAt - a.createdAt);
  const myRequests = [...liveRequests].filter((r) => mine(r.renterEmail)).sort((a, b) => b.createdAt - a.createdAt);
  const myDeals = [...mandiPosts].filter((p) => mine(p.sellerEmail)).sort((a, b) => b.createdAt - a.createdAt);
  const activityCount = myBookings.filter((b) => ["sent", "countered", "confirmed"].includes(b.status)).length + myRequests.filter((r) => r.status === "open").length + myDeals.filter((p) => p.status === "open").length;
  const voucherBooking = voucherId ? bookings.find((b) => b.id === voucherId) : null;
  const activeCount = bookings.filter((b) => ["sent", "countered", "confirmed", "completed"].includes(b.status) && (!session || b.channel === "ussd" || !b.renterEmail || b.renterEmail === session.email)).length;
  const showTab = tab === "members" && !accounts.cloudOwner ? "marketplace" : tab;

  return (
    <div dir={langMeta.dir} lang={lang} className={`min-h-screen w-full max-w-full overflow-x-clip bg-ivory text-soil ${lang === "ur" || lang === "pa" ? "font-nastaliq" : langMeta.dir === "rtl" ? "font-urdu" : "font-sans"}`}>
      <Header t={t} lang={lang} setLang={setLang} country={country} setCountry={setCountry} activityCount={activityCount} onActivity={() => setActivityOpen(true)} tab={showTab} setTab={setTab} pendingCount={pendingCount} activeCount={activeCount} tabs={tabs} adminCount={adminCount}
        account={<AccountMenu t={t} session={session} onSignIn={() => openAuth("signin")} onSignUp={() => openAuth("signup")} onSignOut={signOut} />} />
      <main id="main" className="w-full">
        {showTab === "marketplace" && (
          <>
            <Hero t={t} isEnglish={lang === "en"} stats={{ machines: publicListings.length, owners: new Set(publicListings.map((l) => l.ownerId)).size, bookings: bookings.length }} onFind={() => document.getElementById("market") && document.getElementById("market").scrollIntoView({ behavior: "smooth" })} onList={() => setTab("owner-portal", "list")} onLive={() => setTab("live-request")} />
            <TrustStrip t={t} />
            <KeypadBanner t={t} setTab={setTab} />
            <Marketplace t={t} dn={dn} lang={lang} country={country} setCountry={setCountry} userLoc={userLoc} setUserLoc={setUserLoc} onLive={() => setTab("live-request")} listings={publicListings} activeProvinces={settings.activeProvinces} onBook={(l) => requireAuth(() => setBookingTarget(l))} filters={filters} setFilters={setFilters}
              demoMode={demoMode} fallbackProps={{ t, dn, session, requireAuth, saveDemand, toast, dieselPrice }} />
          </>
        )}
        {showTab === "bookings" && <MyBookings t={t} dn={dn} onVoucher={setVoucherId} bookings={bookings} updateBooking={updateBooking} setTab={setTab} session={session} openAuth={(k) => openAuth(k)} />}
        {showTab === "owner-portal" && <OwnerPortal t={t} dn={dn} demand={demand} listings={realListings.filter((l) => (l.country || "PK") === country)} bookings={bookings} addListing={(f) => requireAuth(() => addListing(f))} session={session} lang={lang} toggleListing={toggleListing} removeListing={removeListing} updateBooking={updateBooking} initialSub={ownerSub} />}
        {showTab === "live-request" && <LiveRequest t={t} dn={dn} listings={publicListings} session={session} requireAuth={requireAuth} createBooking={createBooking} setTab={setTab} toast={toast}
          dieselPrice={dieselPrice} lang={lang} userLoc={userLoc} liveRequests={liveRequests} saveRequest={saveRequest} country={country} setCountry={setCountry} onVoucher={setVoucherId} demoMode={demoMode} saveDemand={saveDemand} />}
        {showTab === "agri-mandi" && <AgriMandi t={t} dn={dn} session={session} requireAuth={requireAuth} bookings={bookings} mandiPosts={mandiPosts} saveMandi={saveMandi} settleFinancing={settleFinancing} lang={lang} userLoc={userLoc} setTab={setTab} toast={toast} />}
        {showTab === "admin" && <AdminPanel t={t} dn={dn} lang={lang} listings={demoMode ? marketListings : realListings} demoMode={demoMode} setDemoMode={setDemoMode} demand={demand} saveDemand={saveDemand} setListingStatus={setListingStatus} bookings={bookings} liveRequests={liveRequests} settings={settings} setSettings={setSettings} resetDemo={resetDemo} toast={toast} accounts={accounts} openAuth={openAuth} mandiPosts={mandiPosts} cloud={cloud} />}
        {showTab === "members" && <MembersAdmin t={t} dn={dn} accounts={accounts} toast={toast} />}
        {showTab === "agri-agent" && <KeypadBanner t={t} setTab={setTab} />}
        {showTab === "agri-agent" && <AgentTab setTab={setTab} t={t} listings={publicListings} createBooking={createBooking} updateBooking={updateBooking} />}
      </main>
      <Footer t={t} setTab={setTab} />
      {bookingTarget && (
        <BookingModal listing={bookingTarget} t={t} dn={dn} session={session} onClose={() => setBookingTarget(null)}
          onSubmit={(details) => { const id = createBooking(bookingTarget, details); setBookingTarget(null); setTab("bookings"); setTimeout(() => setVoucherId(id), 300); }} />
      )}
      {auth && <AuthModal t={t} dn={dn} lang={lang} initialTab={auth.tab} reason={auth.reason} accounts={accounts} onClose={() => setAuth(null)} onDone={onAuthDone} />}
      <KisanHelper t={t} lang={lang} listings={publicListings} open={helperOpen} setOpen={setHelperOpen} session={session} dieselPrice={dieselPrice} />
      <BottomNav t={t} adminCount={adminCount} tab={showTab} setTab={setTab} tabs={tabs} activeCount={activeCount} pendingCount={pendingCount} activityCount={activityCount} onActivity={() => setActivityOpen(true)} />
      <ActivityDrawer t={t} dn={dn} open={activityOpen} onClose={() => setActivityOpen(false)} bookings={myBookings} requests={myRequests} deals={myDeals} onVoucher={(id) => { setActivityOpen(false); setVoucherId(id); }} setTab={setTab} />
      {voucherBooking && <VoucherModal b={voucherBooking} t={t} dn={dn} onClose={() => setVoucherId(null)} updateBooking={updateBooking} />}
      <Toasts toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}

export default App;
