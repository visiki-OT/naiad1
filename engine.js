/*
    Echo1 Pipeline Simulator Simulator
    Copyright (C) 2026 Wavepaper Media Inc.

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
    
    Contact: jim@crss.ca
*/


import { Project, Workspace } from 'https://esm.sh/epanet-js';

// ==========================================
// 0. PREMIUM EV-STYLE AUDIO ENGINE (Web Audio API)
// ==========================================
const SCADA_AUDIO = {
    ctx: null, masterGain: null, interval: null, currentSound: null, activeOscillators: [],
    isMuted: true, // Default to muted on startup
    
    init: function() { 
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)(); 
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 1.0; // Restored to 100% (Individual note chords are already attenuated)
            this.masterGain.connect(this.ctx.destination);
        }
    },
    
    stop: function() { 
        clearInterval(this.interval); 
        this.interval = null; 
        this.currentSound = null;
        
        // Soft-kill any currently ringing oscillators to prevent DC offset pops
        const now = this.ctx ? this.ctx.currentTime : 0;
        this.activeOscillators.forEach(osc => {
            try { 
                osc.stop(now + 0.1); 
                osc.onended = () => { osc.disconnect(); };
            } catch(e) {
                try { osc.disconnect(); } catch(err) {}
            }
        });
        this.activeOscillators = [];
    },
    
    // Helper function to build lush, multi-oscillator chords
    playChord: function(freqs, attack, decay, strumOffset, volLimit) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        freqs.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = i % 2 === 0 ? 'sine' : 'triangle'; 
            osc.frequency.value = freq;
            
            const now = this.ctx.currentTime;
            const stagger = now + (i * strumOffset); 
            
            gain.gain.setValueAtTime(0, stagger);
            gain.gain.linearRampToValueAtTime(volLimit, stagger + attack); 
            // Faster exponential drop-off to prevent muddy sustained tones
            gain.gain.exponentialRampToValueAtTime(0.001, stagger + attack + decay); 
            
            osc.connect(gain); 
            gain.connect(this.masterGain); // Route through Master Gain
            
            osc.start(stagger); 
            const stopTime = stagger + attack + decay + 0.1;
            osc.stop(stopTime);

            this.activeOscillators.push(osc);
            
            // Clean up tracking array when done
            osc.onended = () => {
                this.activeOscillators = this.activeOscillators.filter(o => o !== osc);
            };
        });
    },

    // ALERT: A lush, welcoming C Major 9th chime (1 Chime, No Repeat)
    playAlert: function() { 
        this.stop(); 
        this.currentSound = 'ALERT';
        this.playChord([261.63, 329.63, 392.00, 493.88, 587.33], 0.05, 2.0, 0.03, 0.04); 
        setTimeout(() => { if (this.currentSound === 'ALERT') this.currentSound = null; }, 2500);
    },

    // PRIORITY 3: Fsus4 (1 Chime, 15 Seconds Silence)
    playPrio3: function(isTest = false) { 
        if (this.currentSound === 'P3') return; 
        this.stop(); 
        this.currentSound = 'P3';
        this.isTesting = isTest;
        const pulse = () => { this.playChord([349.23, 466.16, 523.25], 0.1, 1.5, 0.05, 0.05); };
        pulse();
        this.interval = setInterval(pulse, 16500); 
    },

    // PRIORITY 2: A Minor 7 (2 Chimes spaced 1.2s apart, 10 Seconds Silence)
    playPrio2: function(isTest = false) { 
        if (this.currentSound === 'P2') return;
        this.stop(); 
        this.currentSound = 'P2';
        this.isTesting = isTest;
        const pulse = () => {
            const freqs = [220.00, 261.63, 329.63, 392.00]; 
            for(let i=0; i<2; i++) {
                setTimeout(() => { if(this.currentSound === 'P2') this.playChord(freqs, 0.1, 1.0, 0.04, 0.06); }, i * 1200);
            }
        };
        pulse();
        this.interval = setInterval(pulse, 12400); 
    },

    // PRIORITY 1: Eb chord (3 Chimes spaced 1.0s apart, 6 Seconds Silence)
    playPrio1: function(isTest = false) { 
        if (this.currentSound === 'P1') return;
        this.stop(); 
        this.currentSound = 'P1';
        this.isTesting = isTest;
        const pulse = () => {
            const freqs = [311.13, 392.00, 466.16]; 
            for(let i=0; i<3; i++) {
                setTimeout(() => { if(this.currentSound === 'P1') this.playChord(freqs, 0.05, 0.6, 0.03, 0.07); }, i * 1000);
            }
        };
        pulse();
        this.interval = setInterval(pulse, 9000); 
    }
};

function manageAudioPlayback() {
    // FIX: Any unacked alarm (even if it cleared/RTN) keeps the horn ringing!
    const unacked = liveAlarms.filter(a => !a.acked);
    
    // Stop audio if there are no unacked alarms OR if the system is globally muted
    if (unacked.length === 0 || SCADA_AUDIO.isMuted) {
        if (!SCADA_AUDIO.isTesting && SCADA_AUDIO.currentSound !== 'ALERT') SCADA_AUDIO.stop(); 
        return;
    }
    
    SCADA_AUDIO.isTesting = false; // Real pipeline alarms override the test lock
    
    if (unacked.some(a => a.severity === 'Priority 1')) SCADA_AUDIO.playPrio1();
    else if (unacked.some(a => a.severity === 'Priority 2')) SCADA_AUDIO.playPrio2();
    else if (unacked.some(a => a.severity === 'Priority 3')) SCADA_AUDIO.playPrio3();
}

// ==========================================
// 1. UI INTERACTIONS & STATE MANAGEMENT
// ==========================================
let currentMode = 'PAUSED'; 
let isStepTick = true; // Start with one fresh step
let flushBufferNextTick = false; // Flag to fast-forward the pipeline to steady state
let isPredictTick = false; // Flag to run the offline EPANET solve
let rttmDelayEnabled = false; // Default to raw real-time Q1 tracking

let currentSG = 0.85;
let currentVisc = 10;
let currentProfile = 'VISTA';
let currentDia = 24;

let rpmA = 80;
let rpmB = 80; let pumpBTripped = false; let tripTimerB = 0;
let rpmC = 80; let pumpCTripped = false; let tripTimerC = 0;

let spPressA = 1000; 
let pendingSpPressA = 1000;

let spPressB = 100; 
let pendingSpPressB = 100;

let spPressC = 100; 
let pendingSpPressC = 100;

let spPressD = 100; // Dynamic suction setpoint for delivery

let tankVolA = 50000; // Source Tank: Starts Full
const maxTankVolA = 50000;
let tankVolD = 0; // Delivery Tank: Starts Empty
const maxTankVolD = 50000;

let meterVolA = 0;
let meterVolD = 0;
const meterBatchSize = 10000;

let prevErrorA = 0; 
let prevErrorB = 0;
let prevErrorC = 0;

let esdActive = false;
let esdTick = 0;

function restoreSessionState(forceLoad = false) {
    const savedState = localStorage.getItem('echo_snapshot');
    
    // ONLY load if forceLoad is true AND we have a saved state
    if (forceLoad && savedState) {
        const snap = JSON.parse(savedState);
        spPressA = snap.spPressA; pendingSpPressA = snap.pendingSpPressA;
        rpmA = snap.rpmA; rpmB = snap.rpmB; rpmC = snap.rpmC;
        propagationBuffer = snap.propagationBuffer || [];
        
        tankVolA = maxTankVolA; tankVolD = 0;
        meterVolA = 0; meterVolD = 0;
        trendData = []; 
        console.log("📂 Pipeline Snapshot Loaded from LocalStorage!");
    } else {
            // FACTORY DEFAULTS (Clean Slate)
            pendingSpPressA = 750; spPressA = 750; // Lower SP avoids initial suction alarms
            pendingSpPressB = 100; spPressB = 100;
            pendingSpPressC = 100; spPressC = 100;
            spPressD = 100;
            rpmA = 90; rpmB = 90; rpmC = 80;
            tankVolA = maxTankVolA; tankVolD = 0;
        meterVolA = 0; meterVolD = 0;
        propagationBuffer = []; trendData = [];
        console.log("⟳ Starting with Clean Factory Defaults.");
    }
    
    const uiSpA = document.getElementById('ui-sp-a');
    if (uiSpA) uiSpA.innerText = pendingSpPressA;
    
    currentMode = 'RUNNING';
    const statusEl = document.getElementById('sys-status-text');
    if (statusEl) {
        statusEl.innerText = 'RUNNING';
        statusEl.style.color = '#006a6a';
    }
    isStepTick = true; // Take one step to flush UI geometry
}

// --- DIGITAL TWIN SCENARIO BUILDER (STAGED VARIABLES) ---
let stagedSG = 0.85;
let stagedVisc = 10;
let stagedSP = 1000;
let stagedProfile = 'VISTA';
let stagedDia = 24;

const updateCalcUI = (id, val, suffix = '') => {
    const el = document.getElementById(id);
    if (el) el.innerText = val + suffix;
};

// --- ALARM MANAGER ---
let liveAlarms = []; // ISA 18.2 State Array

const ALARM_TAG_MAP = {
    'TAG_LEAK': ['q1-leak-warning'], // Flow rates remain valid, no rings needed
    'TAG_STND_FIRE': ['val-sta-d-suct'], 
    'TAG_STND_COMM': ['val-sta-d-pcv'],
    'TAG_SUCT_B': ['val-sta-b-suct'],
    'TAG_SUCT_C': ['val-sta-c-suct'],
    'TAG_VIB_B': ['icon-sta-b'],
    'TAG_VIB_C': ['icon-sta-c'],
    'TAG_SYS_INIT': ['sys-time-text']
};

function setAlarmState(id, isActive, msg, severity, tag = null) {
    let existing = liveAlarms.find(a => a.id === id);
    const timeStr = new Date(sessionSeconds * 1000).toISOString().substr(11, 8);
    const isAlert = severity === 'Alert';
    
    if (isActive) {
        if (existing) existing.clearTicks = 0; // Reset clearing timer

        if (!existing) {
            // NEW ALARM Triggered
            liveAlarms.unshift({ id, time: timeStr, msg, severity, tag, acked: isAlert, active: true, clearTicks: 0 });
            if (isAlert) { SCADA_AUDIO.init(); SCADA_AUDIO.playAlert(); }
        } else if (!existing.active) {
            // RE-TRIGGER of an old alarm
            existing.active = true;
            existing.acked = isAlert;
            existing.time = timeStr;
            existing.clearTicks = 0;
            
            // Pop the reactivated alarm back to the top of the list
            liveAlarms = liveAlarms.filter(a => a.id !== id);
            liveAlarms.unshift(existing);

            if (isAlert) { SCADA_AUDIO.init(); SCADA_AUDIO.playAlert(); }
        }
    } else {
        if (existing && existing.active) {
            // RETURN TO NORMAL (RTN) - 3 Second Deadband
            existing.clearTicks = (existing.clearTicks || 0) + 1;
            if (existing.clearTicks >= 3) {
                existing.active = false;
                existing.clearTicks = 0;
            }
        }
    }
    
    // Auto-clear alarms that are BOTH normal AND acknowledged
    liveAlarms = liveAlarms.filter(a => !(a.acked && !a.active));
    renderAlarms();
    manageAudioPlayback(); // Hook for Patterson Audio
}

function renderAlarmHighlights() {
    // 1. Wipe all existing correspondence rings
    Object.values(ALARM_TAG_MAP).flat().forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.outline = 'none'; el.style.animation = 'none'; }
    });

    // 2. Paint rings (Unacked alarms, OR Active non-SYSTEM alarms)
    const activeHighlights = liveAlarms.filter(a => !a.acked || (a.active && a.severity !== 'Alert')).reverse();
    activeHighlights.forEach(alarm => {
        if (!alarm.tag || !ALARM_TAG_MAP[alarm.tag]) return;
        
        let color = '#555555'; let anim = 'pulse-sys';
        if (alarm.severity === 'Priority 1') { color = '#ba1a1a'; anim = 'pulse-crit'; }
        if (alarm.severity === 'Priority 2') { color = '#F57C00'; anim = 'pulse-warn'; }
        if (alarm.severity === 'Priority 3') { color = '#1976D2'; anim = 'pulse-maint'; }

        ALARM_TAG_MAP[alarm.tag].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.outline = `2px solid ${color}`;
                el.style.outlineOffset = '2px';
                if (!alarm.acked) el.style.animation = `${anim} 1s infinite`;
                else el.style.animation = 'none'; // Solid ring if acked but still active
            }
        });
    });
}

function renderAlarms() {
    const list = document.getElementById('q4-alarm-list');
    if (!list) return;

    list.innerHTML = '';
    let needsAck = false;

    liveAlarms.forEach(alarm => {
        if (!alarm.acked) needsAck = true;
        
        let iconHtml = ''; let textClass = 'text-[#333333]';
        // FIX: Alarm pulses until acknowledged, even if it returned to normal
        const iconPulse = (!alarm.acked) ? 'animate-pulse' : ''; 
        const rtnStyle = !alarm.active ? 'opacity-50 line-through' : ''; // Strike out when RTN
        
        if (alarm.severity === 'Priority 1') { iconHtml = `<span class="material-symbols-outlined text-[14px] text-[#D32F2F] ${iconPulse}" style="font-variation-settings: 'FILL' 1;">change_history</span>`; textClass = 'font-bold text-[#333333]'; }
        else if (alarm.severity === 'Priority 2') { iconHtml = `<span class="material-symbols-outlined text-[14px] text-[#F57C00] ${iconPulse}" style="font-variation-settings: 'FILL' 1;">square</span>`; }
        else if (alarm.severity === 'Priority 3') { iconHtml = `<span class="material-symbols-outlined text-[14px] text-[#1976D2] ${iconPulse}" style="font-variation-settings: 'FILL' 1;">circle</span>`; }
        else { iconHtml = `<span class="${iconPulse}" style="font-size: 16px; font-weight: bold; color: #555555; display: inline-block; vertical-align: middle; line-height: 1; transform: translateY(1px); width: 24px; text-align: center;">✱</span>`; }

        list.innerHTML += `
            <div class="grid grid-cols-[100px_1fr] px-6 items-center border-b border-outline-variant bg-transparent row-lock">
                <div class="flex items-center gap-2 ${rtnStyle}">${iconHtml}<span class="font-mono text-xs ${textClass}">${alarm.time}</span></div>
                <span class="text-xs ${textClass} ${rtnStyle}">${alarm.msg}</span>
            </div>
        `;
    });

    renderAlarmHighlights();
}

// THE REAL-TIME ESTIMATOR MATH
function updatePrePredictEstimates() {
    // 1. Update the "Live" labels for reference
    const setLbl = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = `(Live: ${val})`; };
    setLbl('ui-live-sg', currentSG.toFixed(2));
    setLbl('ui-live-visc', currentVisc);
    setLbl('ui-live-sp', Math.round(spPressA));

    // 2. Est Friction Loss (Locked by OT Setpoint Logic)
    const estFric = Math.max(0, (stagedSP - 100) / 40);
    const uiEstFric = document.getElementById('calc-est-fric');
    if (uiEstFric) uiEstFric.innerText = estFric.toFixed(1);

    // 3. Est Flow Rate (Proportional proxy based on Actual Live Flow)
    const liveFric = Math.max(0.1, (spPressA - 100) / 40);
    const liveFlow = previousTelemetry['val-sta-a-flow'] || 1800;
    
    let flowMultiplier = 1.0;
    flowMultiplier *= Math.sqrt(estFric / liveFric); // Adjust for Pressure
    if (stagedVisc > 0) flowMultiplier *= Math.sqrt(currentVisc / stagedVisc); // Adjust for Viscosity
    flowMultiplier *= Math.pow(stagedDia / currentDia, 2.5); // Adjust for Pipe Size

    const estFlow = liveFlow * flowMultiplier;
    const uiEstFlow = document.getElementById('calc-est-flow');
    if (uiEstFlow) uiEstFlow.innerText = estFlow.toFixed(0);
    
    // 4. Static Elevation Loss (Fluid Density * Gravity)
    // 1 ft of water = 0.433 PSI. Therefore 100ft of water = 43.3 PSI. SG adjusts this base.
    const staticLossPsiPer100Ft = stagedSG * 43.3;
    const uiEstStatic = document.getElementById('calc-est-static');
    if (uiEstStatic) uiEstStatic.innerText = staticLossPsiPer100Ft.toFixed(1);
    
    // Clear the EPANET model columns since inputs have changed
    const resetMod = (id) => { const el = document.getElementById(id); if (el) el.innerText = '--'; };
    resetMod('calc-mod-fric'); resetMod('calc-mod-static'); resetMod('calc-mod-flow'); resetMod('calc-mod-power');
}

// 1. SG Slider
const calcSliderSG = document.getElementById('calc-slider-sg');
if (calcSliderSG) {
    calcSliderSG.addEventListener('input', (e) => {
        stagedSG = parseFloat(e.target.value);
        updateCalcUI('calc-val-sg', stagedSG.toFixed(2));
        currentMode = 'CALCULATOR'; updateSysStatusUI(); updatePrePredictEstimates();
    });
}

// 2. Visc Slider
const calcSliderVisc = document.getElementById('calc-slider-visc');
if (calcSliderVisc) {
    calcSliderVisc.addEventListener('input', (e) => {
        stagedVisc = parseInt(e.target.value);
        updateCalcUI('calc-val-visc', stagedVisc);
        currentMode = 'CALCULATOR'; updateSysStatusUI(); updatePrePredictEstimates();
    });
}

// 3. Discharge SP Slider
const calcSliderSP = document.getElementById('calc-slider-sp');
if (calcSliderSP) {
    calcSliderSP.addEventListener('input', (e) => {
        stagedSP = parseInt(e.target.value);
        updateCalcUI('calc-val-sp', stagedSP, ' PSI');
        currentMode = 'CALCULATOR'; updateSysStatusUI(); updatePrePredictEstimates();
    });
}

// 4. Dropdowns
const calcSelProfile = document.getElementById('calc-sel-profile');
if (calcSelProfile) {
    calcSelProfile.addEventListener('change', (e) => {
        stagedProfile = e.target.value;
        currentMode = 'CALCULATOR'; updateSysStatusUI(); updatePrePredictEstimates();
    });
}

const calcSelDia = document.getElementById('calc-sel-dia');
if (calcSelDia) {
    calcSelDia.addEventListener('change', (e) => {
        stagedDia = parseInt(e.target.value);
        currentMode = 'CALCULATOR'; updateSysStatusUI(); updatePrePredictEstimates();
    });
}

// Utility to update the Q3 Status bar
function updateSysStatusUI() {
    const statusEl = document.getElementById('sys-status-text');
    const statusDot = document.getElementById('sys-heartbeat');
    if (!statusEl) return;
    
    statusEl.innerText = currentMode;
    
    if (currentMode === 'RUNNING') {
        statusEl.style.color = '#006a6a';
        if (statusDot) statusDot.style.backgroundColor = '#006a6a';
    } else if (currentMode === 'CALCULATOR') {
        statusEl.style.color = '#D32F2F'; 
        if (statusDot) statusDot.style.backgroundColor = '#D32F2F';
    } else {
        statusEl.style.color = '#111111';
        if (statusDot) statusDot.style.backgroundColor = '#555555';
    }
}

document.addEventListener('click', function(event) {
    SCADA_AUDIO.init(); // Wakes up the Audio Engine on first interaction
    
    // LEGEND AUDIO TEST TRIGGERS (Pass true to activate isTesting flag)
    if (event.target.closest('#btn-test-audio-prio1')) { 
        if (SCADA_AUDIO.currentSound === 'P1') { SCADA_AUDIO.stop(); SCADA_AUDIO.isTesting = false; manageAudioPlayback(); }
        else if (!SCADA_AUDIO.isMuted) SCADA_AUDIO.playPrio1(true); 
        return; 
    }
    if (event.target.closest('#btn-test-audio-prio2')) { 
        if (SCADA_AUDIO.currentSound === 'P2') { SCADA_AUDIO.stop(); SCADA_AUDIO.isTesting = false; manageAudioPlayback(); }
        else if (!SCADA_AUDIO.isMuted) SCADA_AUDIO.playPrio2(true); 
        return; 
    }
    if (event.target.closest('#btn-test-audio-prio3')) { 
        if (SCADA_AUDIO.currentSound === 'P3') { SCADA_AUDIO.stop(); SCADA_AUDIO.isTesting = false; manageAudioPlayback(); }
        else if (!SCADA_AUDIO.isMuted) SCADA_AUDIO.playPrio3(true); 
        return; 
    }
    if (event.target.closest('#btn-test-audio-alert')) { 
        if (!SCADA_AUDIO.isMuted) SCADA_AUDIO.playAlert(); 
        return; 
    }
    
    if (event.target.id && event.target.id.startsWith('tab-btn-')) {
        const tabName = event.target.id.replace('tab-btn-', '');
        document.querySelectorAll('[id^="tab-btn-"]').forEach(btn => {
            btn.className = "flex-1 py-2 px-4 border-r border-[#333333] font-headline text-[10px] font-bold uppercase tracking-widest text-[#333333] hover:bg-[#D0D0D0] transition-colors";
        });
        event.target.className = "flex-1 py-2 px-4 border-r border-[#333333] font-headline text-[10px] font-bold uppercase tracking-widest bg-[#37474F] text-white hover:bg-[#37474F] transition-colors";
        document.querySelectorAll('[id^="tab-content-"]').forEach(content => content.classList.add('hidden'));
        document.getElementById('tab-content-' + tabName).classList.remove('hidden');
        
        // Force canvas to fit its CSS bounds when tab is shown
            if (tabName === 'trends') {
                const canvas = document.getElementById('trend-canvas');
                if (canvas) { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; drawTrend(); }
            }
            return;
        }

        // RTTM OVERLAY TOGGLE
        const rttmToggleBtn = event.target.closest('#btn-rttm-toggle');
        if (rttmToggleBtn) {
            rttmDelayEnabled = !rttmDelayEnabled;
            const hgl = document.getElementById('hgl-line');
            const flow = document.getElementById('flow-line');

            if (rttmDelayEnabled) {
                // ACTIVE STATE (Dark theme matching Q2 tabs)
                rttmToggleBtn.className = "absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-[#37474F] border border-[#333333] text-[10px] font-bold uppercase tracking-widest text-white transition-colors shadow-sm flex items-center gap-2";
                rttmToggleBtn.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#6A1B9A]" id="rttm-indicator"></span> RTTM LAG: ON';
                if (hgl) hgl.style.transition = 'd 3s ease-in-out';
                if (flow) flow.style.transition = 'd 3s ease-in-out';
                
                // Show Model Time panel if it exists
                const timePanel = document.getElementById('q1-time-panel');
                if (timePanel) { timePanel.classList.remove('hidden'); timePanel.style.display = 'flex'; }
            } else {
                // INACTIVE STATE (Default light theme)
                rttmToggleBtn.className = "absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 bg-[#E0E0E0] border border-outline text-[10px] font-bold uppercase tracking-widest text-[#555555] hover:bg-[#D0D0D0] transition-colors shadow-sm flex items-center gap-2";
                rttmToggleBtn.innerHTML = '<span class="w-2 h-2 rounded-full bg-[#555555]" id="rttm-indicator"></span> RTTM LAG: OFF';
                if (hgl) hgl.style.transition = 'none';
                if (flow) flow.style.transition = 'none';
                
                // Hide Model Time panel if it exists
                const timePanel = document.getElementById('q1-time-panel');
                if (timePanel) { timePanel.classList.add('hidden'); timePanel.style.display = 'none'; }
            }
            return;
        }

        // SCENARIO INJECTOR LOGIC (Config Tab)
        if (event.target.id === 'btn-inject-scenario') {
            const scId = document.getElementById('sel-scenario').value;
            const delay = parseInt(document.getElementById('input-scenario-delay').value) || 0;
            
            // Safely parse the override input
            const cvcInput = document.getElementById('input-scenario-cvc').value.trim();
            const customCVC = cvcInput === '' ? NaN : parseFloat(cvcInput);
            
            const events = SCENARIO_LIBRARY[scId];
            if (events) {
                events.forEach(ev => {
                    const finalSize = (!isNaN(customCVC) && ev.action === 'TRIGGER_LEAK') ? customCVC : ev.size;
                    scenarioQueue.push({ ...ev, size: finalSize, triggerTick: sessionSeconds + delay + ev.offset });
                });
                
                // Auto-enable RTTM Lag if injecting a leak scenario
                if (scId.includes('leak') && !rttmDelayEnabled) {
                    const rttmBtn = document.getElementById('btn-rttm-toggle');
                    if (rttmBtn) rttmBtn.click(); 
                }
            }
            
            // Provide visual feedback that the injection occurred
            event.target.innerText = "SCENARIO QUEUED";
            event.target.classList.replace('bg-[#37474F]', 'bg-[#1976D2]'); // Temporarily turn Blue
            setTimeout(() => {
                event.target.innerText = "INJECT SCENARIO";
                event.target.classList.replace('bg-[#1976D2]', 'bg-[#37474F]'); // Revert to Dark Grey
            }, 1500);
            return;
        }

        // Trend Selector Logic
        if (event.target.classList.contains('btn-trend-sel')) {
        currentTrendView = event.target.dataset.trend;
        document.querySelectorAll('.btn-trend-sel').forEach(btn => {
            btn.className = "px-3 py-1 bg-[#E0E0E0] text-[#333333] border border-[#777777] font-headline text-[12px] font-bold uppercase tracking-widest hover:bg-[#D0D0D0] transition-colors rounded-sm btn-trend-sel";
        });
        event.target.className = "px-3 py-1 bg-[#37474F] text-white border border-[#333333] font-headline text-[12px] font-bold uppercase tracking-widest transition-colors rounded-sm btn-trend-sel";
        
        // Update Legend
        const l1 = document.getElementById('trend-leg-1');
        const l2 = document.getElementById('trend-leg-2');
        const yAx = document.getElementById('trend-y-axis-label');
        if (currentTrendView === 'AB') { l1.innerText = 'STN A DISC (UPSTREAM)'; l2.innerText = 'STN B SUCT (DOWNSTREAM)'; yAx.innerText = 'UNIT: PSI'; }
        if (currentTrendView === 'BC') { l1.innerText = 'STN B DISC (UPSTREAM)'; l2.innerText = 'STN C SUCT (DOWNSTREAM)'; yAx.innerText = 'UNIT: PSI'; }
        if (currentTrendView === 'CD') { l1.innerText = 'STN C DISC (UPSTREAM)'; l2.innerText = 'STN D SUCT (DOWNSTREAM)'; yAx.innerText = 'UNIT: PSI'; }
        if (currentTrendView === 'FLOW') { l1.innerText = 'FLOW A (ORIGIN)'; l2.innerText = 'FLOW D (DELIVERY)'; yAx.innerText = 'UNIT: m³/h'; }
        
        drawTrend();
        return;
    }

   // GLOBAL BUTTON EVENT DELEGATION FIX
        const btn = event.target.closest('button');
        if (btn) {
            const buttonText = btn.innerText.trim();

            // 1. SETPOINT CONTROLS (Staging phase)
            if (btn.classList.contains('btn-sp-up') || btn.classList.contains('btn-sp-dn')) {
                const stn = btn.dataset.stn;
                const isUp = btn.classList.contains('btn-sp-up');
                const step = stn === 'A' ? 50 : 10;
                
                if (stn === 'A') {
                    pendingSpPressA += isUp ? step : -step;
                    // API 1165 Error Management: Hard cap at 1000 PSI Maximum Operating Pressure
                    if (pendingSpPressA > 1000) pendingSpPressA = 1000;
                    if (pendingSpPressA < 0) pendingSpPressA = 0;
                    document.getElementById('ui-sp-a').innerText = pendingSpPressA;
                    if (currentMode === 'RUNNING') spPressA = pendingSpPressA;
                } else if (stn === 'B') {
                    pendingSpPressB += isUp ? step : -step;
                    document.getElementById('ui-sp-b').innerText = pendingSpPressB;
                    if (currentMode === 'RUNNING') spPressB = pendingSpPressB;
                } else if (stn === 'C') {
                    pendingSpPressC += isUp ? step : -step;
                    document.getElementById('ui-sp-c').innerText = pendingSpPressC;
                    if (currentMode === 'RUNNING') spPressC = pendingSpPressC;
                }
            } 
            
            // 2. TRANSPORT CONTROLS
            else if (buttonText === '▷') { // PLAY
                currentMode = 'RUNNING';
                spPressA = pendingSpPressA; // Commit Staged Setpoints
                spPressB = pendingSpPressB;
                spPressC = pendingSpPressC;
                prevErrorA = 0; prevErrorB = 0; prevErrorC = 0; 
                
                const statusEl = document.getElementById('sys-status-text');
                if (statusEl) {
                    statusEl.innerText = 'RUNNING';
                    statusEl.style.color = '#006a6a'; 
                }
            }
            else if (buttonText === '||') { // PAUSE
                currentMode = 'PAUSED';
                const statusEl = document.getElementById('sys-status-text');
                if (statusEl) {
                    statusEl.innerText = 'PAUSED';
                    statusEl.style.color = '#111111';
                }
            }
            else if (buttonText === '▷|') { // STEP
                spPressA = pendingSpPressA; // Commit Staged Setpoints
                isStepTick = true; // Command the engine to compute one tick
            }
            else if (btn.id === 'btn-ff') { // FAST FORWARD 10x
                currentMode = 'PAUSED'; // Auto-pause for safety
                spPressA = pendingSpPressA; 
                // Instantly crank the engine 10 times in the background
                for(let i = 0; i < 10; i++) {
                    isStepTick = true;
                    runHydraulicTick();
                }
                updateSysStatusUI();
                console.log("⏩ Fast-Forwarded 10 Ticks.");
            }
           else if (btn.id === 'btn-mute') { // TOGGLE GLOBAL AUDIO
                SCADA_AUDIO.isMuted = !SCADA_AUDIO.isMuted;
                const icon = document.getElementById('mute-icon');
                if (icon) {
                    icon.innerText = SCADA_AUDIO.isMuted ? 'volume_off' : 'volume_up';
                    btn.style.color = SCADA_AUDIO.isMuted ? '#888888' : '#555555';
                }
                if (SCADA_AUDIO.isMuted) {
                    SCADA_AUDIO.isTesting = false; // Break the test lock
                    SCADA_AUDIO.stop(); // Force silence immediately
                }
                manageAudioPlayback(); // Instantly apply the mute/unmute state to active alarms
                return;
            }
            else if (btn.id === 'btn-save') { // CSV DATA LOGGER
                if (trendData.length === 0) return;
                
                // Build CSV Header
                let csvContent = "data:text/csv;charset=utf-8,";
                csvContent += "Tick (Reverse),Press_A_Disc,Press_B_Suct,Press_B_Disc,Press_C_Suct,Press_C_Disc,Press_D_Suct,Flow_A,Flow_D,Imb_5m,Imb_1h,True_Leak_1h,Cusum_Vol\n";
                
                // Append Data (Oldest to Newest)
                trendData.forEach((row, index) => {
                    const tickOffset = trendData.length - index; // e.g., -600 means 600 ticks ago
                    const leakVal = row.leakVol ?? row.leakMass ?? 0;
                    const cusumVal = row.cusum ?? 0;
                    const rowStr = `-${tickOffset},${row.pressADisc.toFixed(2)},${row.pressBSuct.toFixed(2)},${row.pressBDisc.toFixed(2)},${row.pressCSuct.toFixed(2)},${row.pressCDisc.toFixed(2)},${row.pressDSuct.toFixed(2)},${row.flowA.toFixed(2)},${row.flowD.toFixed(2)},${row.imb5m.toFixed(2)},${row.imb1h.toFixed(2)},${leakVal.toFixed(2)},${cusumVal.toFixed(2)}`;
                    csvContent += rowStr + "\n";
                });

                // Trigger Download

                // Trigger Download
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `pipeline_sim_dump_${sessionSeconds}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Visual feedback flash
                btn.style.backgroundColor = '#6A1B9A';
                btn.style.color = '#FFFFFF';
                setTimeout(() => { btn.style.backgroundColor = ''; btn.style.color = ''; }, 300);
                return;
            }
            else if (btn.id === 'btn-refresh') { // LOAD SNAPSHOT
                restoreSessionState(true); // Force load the saved snapshot
                console.log("📂 Snapshot manually loaded.");
                
                // Visual feedback flash
                btn.style.backgroundColor = '#1976D2';
                btn.style.color = '#FFFFFF';
                setTimeout(() => { btn.style.backgroundColor = ''; btn.style.color = ''; }, 300);
            }
            else if (btn.id === 'btn-calc-sync') { 
                // Pull live pipeline reality into the offline study
                stagedSG = currentSG;
                stagedVisc = currentVisc;
                stagedSP = Math.round(spPressA); 
                stagedProfile = currentProfile;
                stagedDia = currentDia;
                
                // Update the UI Sliders to match reality
                const uiSg = document.getElementById('calc-slider-sg'); if(uiSg) uiSg.value = stagedSG;
                const uiVisc = document.getElementById('calc-slider-visc'); if(uiVisc) uiVisc.value = stagedVisc;
                const uiSp = document.getElementById('calc-slider-sp'); if(uiSp) uiSp.value = stagedSP;
                const uiProf = document.getElementById('calc-sel-profile'); if(uiProf) uiProf.value = stagedProfile;
                const uiDia = document.getElementById('calc-sel-dia'); if(uiDia) uiDia.value = stagedDia;

                updateCalcUI('calc-val-sg', stagedSG.toFixed(2));
                updateCalcUI('calc-val-visc', stagedVisc);
                updateCalcUI('calc-val-sp', stagedSP, ' PSI');
                
                updatePrePredictEstimates();
                
                // Hide any old predicted HGL line
                const dashedHgl = document.getElementById('hgl-line-predict');
                if (dashedHgl) dashedHgl.style.display = 'none';

                console.log("📥 Offline Study synced to Live process variables.");
            }
            else if (btn.id === 'btn-calc-predict') { 
                currentMode = 'CALCULATOR';
                updateSysStatusUI();
                isPredictTick = true; 
                isStepTick = true;    
                console.log("🔍 Running Predictive Model...");
            }
            else if (btn.id === 'btn-mqtt-connect') {
                const url = document.getElementById('mqtt-broker-url').value;
                const user = document.getElementById('mqtt-user').value;
                const pass = document.getElementById('mqtt-pass').value;
                connectToBroker(url, user, pass);
            }
            else if (btn.id === 'btn-calc-commit') { 
                currentSG = stagedSG;
                currentVisc = stagedVisc;
                currentProfile = stagedProfile;
                currentDia = stagedDia;
                
                spPressA = stagedSP;
                pendingSpPressA = stagedSP;
                const uiSpA = document.getElementById('ui-sp-a');
                if (uiSpA) uiSpA.innerText = pendingSpPressA;
                
                flushBufferNextTick = true; 
                
                // Automatically click the Play button to resume time
                const btnPlay = document.getElementById('btn-play');
                if (btnPlay) {
                    btnPlay.click(); 
                } else {
                    currentMode = 'RUNNING';
                } 
                
                updateSysStatusUI();
                prevErrorA = 0; prevErrorB = 0; prevErrorC = 0; 
                console.log("🚀 Scenario variables committed to Live process.");
            }
            
            // 3. GLOBAL ALARMS
            else if (buttonText === 'ESD') {
                const modal = document.getElementById('esd-modal');
                if (modal) modal.classList.remove('hidden');
            } 
            else if (btn.id === 'btn-support') {
                const card = document.getElementById('q2-business-card');
                if (card) card.classList.remove('hidden');
            }
            else if (btn.id === 'btn-close-card') {
                const card = document.getElementById('q2-business-card');
                if (card) card.classList.add('hidden');
            }
            else if (btn.id === 'btn-esd-cancel') {
                const modal = document.getElementById('esd-modal');
                if (modal) modal.classList.add('hidden');
            }
            else if (btn.id === 'btn-esd-confirm') {
                const modal = document.getElementById('esd-modal');
                if (modal) modal.classList.add('hidden');
                
                esdActive = true;
                esdTick = 0;
                currentMode = 'RUNNING'; // Force it to run the shutdown sequence if paused
                
                // Visually latch all ESD buttons
                const esdBtns = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'ESD');
                esdBtns.forEach(b => { b.style.backgroundColor = '#ba1a1a'; b.style.color = '#ffffff'; });
                
                setAlarmState('ESD_LOCAL', true, 'EMERGENCY SHUTDOWN INITIATED', 'Alert', 'TAG_SYS_INIT');
            }
            else if (btn.id === 'btn-ack-all') {
                liveAlarms.forEach(a => a.acked = true);
                liveAlarms = liveAlarms.filter(a => !(a.acked && !a.active)); // Clear RTN alarms instantly
                renderAlarms();
            }
        }
    });

// ==========================================
// 2. COMPONENT FACTORY (OBJECT LIBRARY)
// ==========================================
const ObjectLibrary = {
    colors: {
        active: "#555555",       
        white: "#FFFFFF",        
        bg: "#F1F1F1",           
        stroke: "#555555",       
        secondary: "#A0A0A0"     
    },
    
    weights: {
        stroke: 4,               
        mainLine: 3,             
        secondaryLine: 2         
    },

    getPatternDef: function(patternId) {
        return `
            <defs>
                <pattern id="${patternId}" patternUnits="userSpaceOnUse" width="12" height="12">
                    <rect width="12" height="12" fill="${this.colors.white}" />
                    <circle cx="6" cy="6" r="3.5" fill="${this.colors.active}" />
                    <circle cx="0" cy="0" r="3.5" fill="${this.colors.active}" />
                    <circle cx="12" cy="0" r="3.5" fill="${this.colors.active}" />
                    <circle cx="0" cy="12" r="3.5" fill="${this.colors.active}" />
                    <circle cx="12" cy="12" r="3.5" fill="${this.colors.active}" />
                </pattern>
            </defs>
        `;
    },

    _generateAsset: function(dim, fillDef, fillRef, geometrySVG) {
        return `
            <svg height="${dim}" viewBox="0 0 100 100" width="${dim}" xmlns="http://www.w3.org/2000/svg">
                ${fillDef}
                <g stroke="${this.colors.stroke}" stroke-width="${this.weights.stroke * 2}" stroke-linejoin="round" fill="${this.colors.stroke}">
                    ${geometrySVG}
                </g>
                <g fill="${fillRef}" stroke="none">
                    ${geometrySVG}
                </g>
            </svg>
        `;
    },

    getPump: function(state, size = 'L2') {
        const dim = size === 'L3' ? "56" : "26";
        let fillRef = "";
        let fillDef = "";
        
        if (state === "RUNNING") {
            fillRef = this.colors.active; 
        } else if (state === "STOPPED") {
            fillRef = this.colors.white; 
        } else if (state === "TRANSITION") {
            const patId = "pat-ht-" + Math.random().toString(36).substr(2, 9);
            fillDef = this.getPatternDef(patId);
            fillRef = `url(#${patId})`;
        } else {
            fillRef = this.colors.white;
        }

        const geometry = `
            <polygon points="40,60 15,95 65,95"></polygon>
            <rect x="40" y="35" width="45" height="15"></rect>
            <circle cx="40" cy="60" r="25"></circle>
        `;
        return this._generateAsset(dim, fillDef, fillRef, geometry);
    },

    getGateValve: function(state, size = 'L2') {
        const dim = size === 'L3' ? "56" : "26";
        let fillRef = "";
        let fillDef = "";

        if (state === "OPEN") {
            fillRef = this.colors.active;
        } else if (state === "CLOSED") {
            fillRef = this.colors.white;
        } else if (state === "TRANSITION") {
            const patId = "pat-ht-" + Math.random().toString(36).substr(2, 9);
            fillDef = this.getPatternDef(patId);
            fillRef = `url(#${patId})`;
        } else {
            fillRef = this.colors.white;
        }

        const geometry = `
            <polygon points="10,25 50,50 10,75"></polygon>
            <polygon points="90,25 50,50 90,75"></polygon>
        `;
        return this._generateAsset(dim, fillDef, fillRef, geometry);
    },

    getPCV: function(size = 'L2') {
        const dim = size === 'L3' ? "56" : "26";
        const fillRef = this.colors.bg; 
        
        const geometry = `
            <polygon points="10,35 50,60 10,85"></polygon>
            <polygon points="90,35 50,60 90,85"></polygon>
            <rect x="46" y="10" width="8" height="50"></rect>
            <rect x="30" y="10" width="40" height="6"></rect>
        `;
        return this._generateAsset(dim, "", fillRef, geometry);
    },
    
    getFlowMeter: function(size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        const geometry = `<circle cx="50" cy="50" r="40"></circle>`;
        return this._generateAsset(dim, "", this.colors.bg, geometry);
    },
    getTank: function(fillPercent, size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        const strokeW = this.weights.stroke; // Thinner stroke
        const fillH = 80 * (fillPercent / 100);
        const fillY = 90 - fillH; 
        
        const geometry = `
            <rect x="10" y="10" width="80" height="80" fill="${this.colors.white}" stroke="${this.colors.stroke}" stroke-width="${strokeW}"></rect>
            <rect x="10" y="${fillY}" width="80" height="${fillH}" fill="${this.colors.active}"></rect>
        `;
        return `<svg height="${dim}" viewBox="0 0 100 100" width="${dim}" xmlns="http://www.w3.org/2000/svg">${geometry}</svg>`;
    },
    
    getOcean: function(size = 'L3') {
        const dim = size === 'L3' ? "56" : "26";
        const strokeW = this.weights.stroke * 2;
        const geometry = `
            <path d="M 5 50 Q 25 30 50 50 T 95 50 L 95 90 L 5 90 Z" fill="${this.colors.white}" stroke="${this.colors.stroke}" stroke-width="${strokeW}"></path>
            <path d="M 5 70 Q 25 50 50 70 T 95 70" fill="none" stroke="${this.colors.stroke}" stroke-width="${this.weights.stroke}"></path>
        `;
        return `<svg height="${dim}" viewBox="0 0 100 100" width="${dim}" xmlns="http://www.w3.org/2000/svg">${geometry}</svg>`;
    },
    
    getLineDef: function(type = 'MAIN') {
        const weight = type === 'MAIN' ? this.weights.mainLine : this.weights.secondaryLine;
        const color = type === 'MAIN' ? this.colors.stroke : this.colors.secondary;
        return `border: none; border-top: ${weight}px solid ${color}; width: 100%;`;
    }
};

// ==========================================
// 3. DATA BINDING (Reading the JSON)
// ==========================================
async function loadPipelineData() {
    try {
        const response = await fetch('pods-config.json');
        const pipelineData = await response.json();
        
        const titleElement = document.getElementById('pipeline-title-display');
        if (titleElement) {
            titleElement.innerText = "ALARM SUMMARY - " + pipelineData.pipelineName.toUpperCase();
        }
    } catch (error) {
        console.error("🔴 JSON ERROR: Could not load pods-config.json", error);
    }
}

// ==========================================
// 4. HYDRAULIC MATH ENGINE (EPANET HEARTBEAT)
// ==========================================
let workspace = null;
let physicsHeartbeat = null;
let rttmHeartbeat = null;
let previousTelemetry = {}; 
let rocState = {}; // NEW: Stateful RoC tracker for Fast-Attack / Slow-Decay
const ROC_MAX_DELTA = 25; // Adjusted to leave plenty of room for massive rupture spikes

// Dual-Track State Caching
let latestHGLTarget = [];
let latestFlowTargetY = 2000;
let lastPublishedMQTT = {};
const MQTT_DEADBAND = 0.5;

// --- SCENARIO & LDS ENGINE ---
let sessionSeconds = 0; // 1 Tick = 1 Second
let scenarioQueue = [];
let activeLeakNode = null;
let activeLeakSize = 0;
let currentLeakK = 1000000; // Tracks the live resistance as the valve strokes open
let activeLeakTime = null;
let cumulativeImbalanceM3 = 0; // Tracks total missing volume
let ldsTimer5m = 0; // LDS Persistence Timer (5 Min Rate)
let ldsTimer1h = 0; // LDS Persistence Timer (1 Hour Rate)
let prevAvgPress = 0;
let rttmBuffer = []; // NEW: 60-second Data Buffer for simulated calculation lag
let smoothedAvgPress = 0; // Tracks the EMA of pipeline pressure
let waveOrigin = 0; // NEW: Tracks the mile-post of the transient event

// Leaky Bucket Accumulators (Replaces Boxcar Arrays)
let imb5m_acc = 0; 
let imb1h_acc = 0;
let trueLeak_acc = 0; 

const SCENARIO_LIBRARY = {
    'leak_small_70': [
        { offset: 0, type: 'PROCESS', action: 'TRIGGER_LEAK', node: 'NODE_LEAK_70', size: 450, msg: 'SMALL LEAK (10%): SEGMENT A-C', tag: 'TAG_LEAK' }
    ]
    /*
    'leak_medium_70': [
        { offset: 0, type: 'PROCESS', action: 'TRIGGER_LEAK', node: 'NODE_LEAK_70', size: 50, msg: 'MEDIUM LEAK (30%): SEGMENT A-C', tag: 'TAG_LEAK' }
    ],
    'leak_large_70': [
        { offset: 0, type: 'PROCESS', action: 'TRIGGER_LEAK', node: 'NODE_LEAK_70', size: 5, msg: 'MAJOR RUPTURE (90%): SEGMENT A-C', tag: 'TAG_LEAK' }
    ],
    'fire_stn_d': [
        { offset: 0, type: 'DISCRETE', severity: 'Priority 1', msg: 'FIRE ALARM: STN D MCC ROOM', tag: 'TAG_STND_FIRE' },
        { offset: 5, type: 'DISCRETE', severity: 'Priority 2', msg: 'COMM_LOSS: STN D PLC-A UNREACHABLE', tag: 'TAG_STND_COMM' }
    ]
    */
};

// Trend Architecture
let currentTrendView = 'AB';
const TREND_MAX_POINTS = 600; // 10 minutes at 1.0s per tick
let trendData = []; // Array of objects caching historical telemetry

// Transient Wave Propagation (FIFO Hack)
const MAX_DELAY_TICKS = 300; // Expanded to hold up to 5 mins (accommodates 1.5s/mile wave speed)
let propagationBuffer = []; 

let isWarmup = false; // Flag to silence UI/Alarms during boot

async function initPhysicsEngine() {
    console.log("%c ECHO-1 INDUSTRIAL SCADA ", "background: #37474F; color: #FFF; font-weight: bold; padding: 4px;");
    console.log("⚙️ Booting WebAssembly Physics Engine...");
    workspace = new Workspace();
    await workspace.loadModule();
    
    // --- PRE-CONDITIONING (WARMUP) ---
    console.log("🔥 Running 100-tick pre-conditioning sequence...");
    isWarmup = true;
    let tempMode = currentMode;
    currentMode = 'RUNNING'; // Force engine math to calculate
    
    for(let i = 0; i < 100; i++) {
        runHydraulicTick();
    }
    
    // Wipe the slate clean after warmup
    sessionSeconds = 0;
    esdActive = false;
    esdTick = 0;
    spPressD = 100;
    tankVolA = maxTankVolA; tankVolD = 0;
    meterVolA = 0; meterVolD = 0;
    trendData = []; 
    liveAlarms = []; 
    
    // Reset the new leaky bucket accumulators and pressure trackers
    imb5m_acc = 0; 
    imb1h_acc = 0;
    trueLeak_acc = 0;
    prevAvgPress = 0;
    smoothedAvgPress = 0;
    waveOrigin = 0; // Reset origin on boot
    cumulativeImbalanceM3 = 0; // Clear the accumulator on restart
    ldsTimer5m = 0; // Reset LDS timer
    ldsTimer1h = 0; // Reset LDS timer
    rttmBuffer = []; // NEW: Flush the 60-second buffer so old data doesn't bleed into new scenarios!
    pumpBTripped = false; tripTimerB = 0;
    pumpCTripped = false; tripTimerC = 0;
    
    // Pad the propagation buffer to 300 ticks so delays work instantly
    while (propagationBuffer.length < MAX_DELAY_TICKS) {
        propagationBuffer.push(propagationBuffer[0]);
    }
    
    currentMode = tempMode;
    isWarmup = false;
    
    // Force one final step to flush the pristine settled data to the UI
    isStepTick = true;
    runHydraulicTick();

    console.log("🟢 Workspace Ready. Starting Dual-Track Heartbeats...");
    physicsHeartbeat = setInterval(runHydraulicTick, 1000); 
    rttmHeartbeat = setInterval(runRTTMTick, 20000);        
}

function runRTTMTick() {
    if (!rttmDelayEnabled || latestHGLTarget.length === 0) return; // Skip if disabled or booting

    // Convert cached target coordinates to an SVG Path string
    const pathD = latestHGLTarget.map((pt, i) => 
        (i === 0 ? 'M ' : 'L ') + pt.x + ' ' + pt.y.toFixed(1)
    ).join(' ');

    const hglEl = document.getElementById('hgl-line');
    if (hglEl) hglEl.setAttribute('d', pathD);

    const flowEl = document.getElementById('flow-line');
    if (flowEl) {
        flowEl.setAttribute('d', `M 0 ${latestFlowTargetY[0].toFixed(1)} L 40 ${latestFlowTargetY[1].toFixed(1)} L 80 ${latestFlowTargetY[2].toFixed(1)} L 160 ${latestFlowTargetY[3].toFixed(1)}`);
    }
    
    console.log("⏱️ RTTM BATCH UPDATE: Q1 Profile Rendered.");
}

function runHydraulicTick() {
    if (!workspace) return;
    
    // 1. Halt the simulation entirely if Paused or in Calculator Mode (unless a step is commanded)
    if ((currentMode === 'PAUSED' || currentMode === 'CALCULATOR') && !isStepTick) return;

    try {
        let rawPressADisc, rawPressBSuct, rawPressCSuct, rawFlowA, rawFlowD;
        let rawPressBDisc, rawPressCDisc, rawPressDSuct, rawPressASuct;
        let hA_Suct, hA_Disc, hB_Suct, hB_Disc, hC_Suct, hC_Disc, hD;
        let actualLeakFlow = 0;
        
        // 1. ISOLATE PREDICT STATE FROM LIVE STATE
        const isPredict = isPredictTick;
        const maxIters = isPredict ? 100 : 1; // 100 iterations guarantees convergence for massive pumps
        
        const activeSG = isPredict ? stagedSG : currentSG;
        const activeVisc = isPredict ? stagedVisc : currentVisc;
        const activeDia = isPredict ? stagedDia : currentDia;
        const activeProfile = isPredict ? stagedProfile : currentProfile;
        
        // Elevation Profile Mapping
        const isFlat = activeProfile === 'FLAT';
        const zA = isFlat ? 0 : 2000; // Added Station A
        const zV1 = isFlat ? 0 : 2400;
        const zB = isFlat ? 0 : 1950;
        const zP1 = isFlat ? 0 : 1800;
        const zC = isFlat ? 0 : 2100;
        const zV2 = isFlat ? 0 : 2200;
        const zS1 = isFlat ? 0 : 200;

        // Isolate Machine Inertia and PIDs using dummy variables
        let simRpmA = rpmA, simRpmB = rpmB, simRpmC = rpmC;
        let simPrevErrA = prevErrorA, simPrevErrB = prevErrorB, simPrevErrC = prevErrorC;

        // 2. THE MATHEMATICAL ENGINE
        for (let iter = 0; iter < maxIters; iter++) {
            const sfA = Math.max(simRpmA / 100, 0.01);
            const sfB = Math.max(simRpmB / 100, 0.01);
            const sfC = Math.max(simRpmC / 100, 0.01);

            const rawLines = [
                "[TITLE]", "Echo1 Mainline Prototype", "",
                "[OPTIONS]",
                "HEADLOSS D-W", // Force Darcy-Weisbach physics
                `SPECIFIC GRAVITY ${activeSG}`,
                `VISCOSITY ${activeVisc}`,
                "",
                "[RESERVOIRS]", `RES_A ${zA}`, "RES_D 0", 
                (activeLeakNode === 'NODE_LEAK_70' ? `RES_ATM_70 ${zP1}` : ""), // Atmospheric tank for leak
                "",
                "[JUNCTIONS]",
                `NODE_A_DISC ${zA} 0`, `NODE_VALLEY_1 ${zV1} 0`, `NODE_B_SUCT ${zB} 0`, `NODE_B_DISC ${zB} 0`,
                `NODE_PEAK_1 ${zP1} 0`, `NODE_C_SUCT ${zC} 0`, `NODE_C_DISC ${zC} 0`, `NODE_VALLEY_2 ${zV2} 0`,
                `NODE_SLOPE_1 ${zS1} 0`, `NODE_D_INLET 0 0`, `NODE_D_OUTLET 0 0`, 
                `NODE_B_BYP ${zB} 0`, `NODE_C_BYP ${zC} 0`, // Dummy nodes for bypass lines
                "",
                "[PIPES]",
                // Swapped H-W "120" for D-W absolute roughness "0.15" millifeet
                `PIPE_A_V1 NODE_A_DISC NODE_VALLEY_1 52800 ${activeDia} 0.15`, `PIPE_V1_B NODE_VALLEY_1 NODE_B_SUCT 158400 ${activeDia} 0.15`,
                `PIPE_B_P1 NODE_B_DISC NODE_PEAK_1 52800 ${activeDia} 0.15`, 
                `PIPE_P1_C NODE_PEAK_1 NODE_C_SUCT 158400 ${activeDia} 0.15`, // Standard continuous mainline
                `PIPE_C_V2 NODE_C_DISC NODE_VALLEY_2 52800 ${activeDia} 0.15`, `PIPE_V2_S1 NODE_VALLEY_2 NODE_SLOPE_1 316800 ${activeDia} 0.15`,
                `PIPE_S1_D NODE_SLOPE_1 NODE_D_INLET 52800 ${activeDia} 0.15`, `PIPE_D_DUMMY NODE_D_OUTLET RES_D 10 ${activeDia} 0.15`, 
                // STATION BYPASS LINES (Using dummy nodes to prevent topological matrix singularity)
                `PIPE_BYP_B1 NODE_B_SUCT NODE_B_BYP 10 ${activeDia} 0.15`, 
                `PIPE_BYP_C1 NODE_C_SUCT NODE_C_BYP 10 ${activeDia} 0.15`, "",
                "[VALVES]", 
                `VALVE_D NODE_D_INLET NODE_D_OUTLET ${activeDia} PSV ${spPressD}`, 
                // STATION BYPASS VALVES (PSVs hold 10 PSI upstream to prevent mountain drafting when pump trips)
                `VALVE_BYP_B NODE_B_BYP NODE_B_DISC ${activeDia} PSV 10`,
                `VALVE_BYP_C NODE_C_BYP NODE_C_DISC ${activeDia} PSV 10`,
                // The actual leak point: 6-Inch Throttle Control Valve (TCV) to atmosphere
                (activeLeakNode === 'NODE_LEAK_70' ? `VALVE_LEAK_70 NODE_PEAK_1 RES_ATM_70 6 TCV ${currentLeakK}` : ""), "",
                "[CURVES]", "CURVE_1 0 3200", "CURVE_1 11000 2750", "CURVE_1 15000 2000", "",
                "[PUMPS]",
                `PUMP_A RES_A NODE_A_DISC HEAD CURVE_1 SPEED ${sfA}`,
                `PUMP_B NODE_B_SUCT NODE_B_DISC HEAD CURVE_1 SPEED ${sfB}`,
                `PUMP_C NODE_C_SUCT NODE_C_DISC HEAD CURVE_1 SPEED ${sfC}`, "",
                "[END]", ""
            ];
            
            workspace.writeFile('echo1.inp', rawLines.join('\n'));
            const model = new Project(workspace);
            model.open('echo1.inp', 'report.rpt', 'out.out');
            model.solveH();

            const getPressure = (nodeId) => { try { return model.getNodeValue(model.getNodeIndex(nodeId), 11); } catch { return 0; } };
            const getFlow = (linkId) => { try { return model.getLinkValue(model.getLinkIndex(linkId), 8); } catch { return 0; } };
            const getHead = (nodeId) => { try { return model.getNodeValue(model.getNodeIndex(nodeId), 10); } catch { return 0; } };

            rawPressADisc = getPressure('NODE_A_DISC'); rawPressBSuct = getPressure('NODE_B_SUCT'); rawPressCSuct = getPressure('NODE_C_SUCT');
            rawFlowA = getFlow('PIPE_A_V1') * 0.227125; rawFlowD = getFlow('PIPE_S1_D') * 0.227125;
            
            // Query the true physical flow rate spilling out of the Gate Valve (TCV)
            actualLeakFlow = activeLeakNode === 'NODE_LEAK_70' ? (getFlow('VALVE_LEAK_70') * 0.227125) : 0;
            
            rawPressBDisc = getPressure('NODE_B_DISC'); rawPressCDisc = getPressure('NODE_C_DISC');
            rawPressDSuct = getPressure('NODE_D_INLET'); rawPressASuct = 30.0;
            
            hA_Suct = getHead('RES_A'); hA_Disc = getHead('NODE_A_DISC');
            hB_Suct = getHead('NODE_B_SUCT'); hB_Disc = getHead('NODE_B_DISC');
            hC_Suct = getHead('NODE_C_SUCT'); hC_Disc = getHead('NODE_C_DISC');
            hD = getHead('NODE_D_INLET');
            
            // --- ISOLATED PID CONTROLLERS ---
            // Predictive uses smaller step limits over 100 iterations to prevent violent overshoot
            const MAX_RPM_DELTA = isPredict ? 2.0 : 0.5; 
            
            // Stn A: Targets SP (Staged SP if predicting, Live SP if running)
            const targetPressA = isPredict ? stagedSP : spPressA;
            const errorA = targetPressA - rawPressADisc; 
            
            const kp_disc = isPredict ? 0.01 : 0.005;
            const ki_disc = isPredict ? 0.05 : 0.001;
            
            let deltaRpmA = (kp_disc * (errorA - simPrevErrA)) + (ki_disc * errorA);
            deltaRpmA = Math.max(-MAX_RPM_DELTA, Math.min(MAX_RPM_DELTA, deltaRpmA)); 
            simPrevErrA = errorA; 
            if (!esdActive) simRpmA = Math.max(50, Math.min(100, simRpmA + deltaRpmA)); // Testing 50% deadhead threshold

            // Stn B & C: Target Dynamic Suction Setpoints
            // Moderated gains heavily to account for EPANET's lack of mechanical inertia
            const kp_suct = isPredict ? 0.5 : 0.03; 
            const ki_suct = isPredict ? 0.5 : 0.01;
            const PID_DEADBAND = 1.0; // 1 PSI threshold to completely stop micro-hunting
            
            const targetPressB = isPredict ? spPressB : spPressB; 
            let errorB = rawPressBSuct - targetPressB; 
            // Apply Deadband: If error is less than 1 PSI, ignore it (forces VFD to hold steady)
            if (Math.abs(errorB) < PID_DEADBAND && !isPredict) errorB = 0;

            let deltaRpmB = (kp_suct * (errorB - simPrevErrB)) + (ki_suct * errorB);
            deltaRpmB = Math.max(-MAX_RPM_DELTA, Math.min(MAX_RPM_DELTA, deltaRpmB)); 
            simPrevErrB = errorB; 
            if (!esdActive) simRpmB = pumpBTripped ? 0 : Math.max(50, Math.min(100, simRpmB + deltaRpmB)); 

            const targetPressC = isPredict ? spPressC : spPressC;
            let errorC = rawPressCSuct - targetPressC; 
            // Apply Deadband: If error is less than 1 PSI, ignore it (forces VFD to hold steady)
            if (Math.abs(errorC) < PID_DEADBAND && !isPredict) errorC = 0;

            let deltaRpmC = (kp_suct * (errorC - simPrevErrC)) + (ki_suct * errorC);
            deltaRpmC = Math.max(-MAX_RPM_DELTA, Math.min(MAX_RPM_DELTA, deltaRpmC)); 
            simPrevErrC = errorC; 
            if (!esdActive) simRpmC = pumpCTripped ? 0 : Math.max(50, Math.min(100, simRpmC + deltaRpmC));

            model.close();
            // Bulletproof WebAssembly memory cleanup (ignores if not required by your version)
            if (typeof model.delete === 'function') model.delete();
            if (typeof model.free === 'function') model.free();
        }

        // 3. PREDICT TICK EXIT PROTOCOL
        if (isPredictTick) {
            // Update Data Grid
            const modFric = (rawPressADisc - rawPressBSuct) / 40;
            const uiModFric = document.getElementById('calc-mod-fric');
            if (uiModFric) uiModFric.innerText = modFric.toFixed(1);
            
            const modStaticLoss = activeSG * 43.3;
            const uiModStatic = document.getElementById('calc-mod-static');
            if (uiModStatic) uiModStatic.innerText = modStaticLoss.toFixed(1);

            const uiModFlow = document.getElementById('calc-mod-flow');
            if (uiModFlow) uiModFlow.innerText = rawFlowA.toFixed(0);
            
            // Total Power (kW) Calculation
            const headPumpA = hA_Disc - hA_Suct;
            const headPumpB = hB_Disc - hB_Suct;
            const headPumpC = hC_Disc - hC_Suct;
            const totalPumpHeadFt = Math.max(0, headPumpA + headPumpB + headPumpC);
            const totalPowerKw = (rawFlowA / 3600) * (activeSG * 1000) * 9.81 * (totalPumpHeadFt * 0.3048) / 1000;
            
            const uiModPower = document.getElementById('calc-mod-power');
            if (uiModPower) uiModPower.innerText = totalPowerKw.toFixed(0);

            // Draw Dashed HGL
            const predictHGLTarget = [
                { x: 0,   y: Math.max(0, 5000 - hA_Suct) }, { x: 0,   y: Math.max(0, 5000 - hA_Disc) }, 
                { x: 40,  y: Math.max(0, 5000 - hB_Suct) }, { x: 40,  y: Math.max(0, 5000 - hB_Disc) }, 
                { x: 80,  y: Math.max(0, 5000 - hC_Suct) }, { x: 80,  y: Math.max(0, 5000 - hC_Disc) }, 
                { x: 160, y: Math.max(0, 5000 - hD) }       
            ];
            const pathD = predictHGLTarget.map((pt, i) => (i === 0 ? 'M ' : 'L ') + pt.x + ' ' + pt.y.toFixed(1)).join(' ');
            
            const svg = document.querySelector('#q1-container svg');
            let dashedHgl = document.getElementById('hgl-line-predict');
            if (!dashedHgl) {
                dashedHgl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                dashedHgl.setAttribute("id", "hgl-line-predict");
                dashedHgl.setAttribute("fill", "none");
                dashedHgl.setAttribute("stroke", "#008E97"); // Bondi Blue
                dashedHgl.setAttribute("stroke-width", "2.0"); 
                dashedHgl.setAttribute("stroke-dasharray", "12, 8");
                dashedHgl.setAttribute("stroke-linecap", "butt");
                dashedHgl.setAttribute("vector-effect", "non-scaling-stroke");
                svg.appendChild(dashedHgl);
            }
            dashedHgl.setAttribute("d", pathD);
            dashedHgl.style.display = 'block';

            // Draw Dashed Flow Line
            const predFlowY = 5000 - ((rawFlowA / 3000) * 5000);
            let dashedFlow = document.getElementById('flow-line-predict');
            if (!dashedFlow) {
                dashedFlow = document.createElementNS("http://www.w3.org/2000/svg", "path");
                dashedFlow.setAttribute("id", "flow-line-predict");
                dashedFlow.setAttribute("fill", "none");
                dashedFlow.setAttribute("stroke", "#00B4CC"); // Aqua
                dashedFlow.setAttribute("stroke-width", "2.0");
                dashedFlow.setAttribute("stroke-dasharray", "12, 8");
                dashedFlow.setAttribute("stroke-linecap", "butt");
                dashedFlow.setAttribute("vector-effect", "non-scaling-stroke");
                svg.appendChild(dashedFlow);
            }
            dashedFlow.setAttribute("d", `M 0 ${predFlowY.toFixed(1)} L 160 ${predFlowY.toFixed(1)}`);
            dashedFlow.style.display = 'block';

            isPredictTick = false; 
            isStepTick = false;
            return; // EXIT EARLY. DO NOT TOUCH LIVE BUFFERS.
        }

        // 4. LIVE TICK PROTOCOL (If we reach here, it was NOT a predict tick)
        if (currentMode === 'RUNNING' || isStepTick) sessionSeconds++; // Increment Sim Time

        if (esdActive && (currentMode === 'RUNNING' || isStepTick)) {
            esdTick++;
            
            // Soften pump shutdown: Ramp down RPM over 120 ticks (1% per tick)
            if (esdTick < 120) {
                simRpmA = Math.max(0, simRpmA - 1.0);
                simRpmB = Math.max(0, simRpmB - 1.0);
                simRpmC = Math.max(0, simRpmC - 1.0);
            } else {
                simRpmA = 0; simRpmB = 0; simRpmC = 0;
            }
            
            pendingSpPressA = 0; pendingSpPressB = 0; pendingSpPressC = 0;
            
            // Raise delivery backpressure progressively to prevent line drain
            if (esdTick % 10 === 0 && spPressD < 800) {
                spPressD = Math.min(800, spPressD + 50);
            }
            
            // Forcefully override UI setpoints for visual feedback
            const uiSpA = document.getElementById('ui-sp-a'); if (uiSpA) uiSpA.innerText = 0;
            const uiSpB = document.getElementById('ui-sp-b'); if (uiSpB) uiSpB.innerText = 0;
            const uiSpC = document.getElementById('ui-sp-c'); if (uiSpC) uiSpC.innerText = 0;
        }

        // SCENARIO EVENT EVALUATION
        for (let i = scenarioQueue.length - 1; i >= 0; i--) {
            const ev = scenarioQueue[i];
            if (sessionSeconds >= ev.triggerTick) {
                if (ev.type === 'PROCESS' && ev.action === 'TRIGGER_LEAK') {
                    activeLeakNode = ev.node;
                    activeLeakSize = ev.size;
                    currentLeakK = 1000000; // Reset the valve to "Just barely cracked open"
                    activeLeakTime = sessionSeconds;
                    waveOrigin = 70; // Set transient origin to Mile 70 for Speed of Sound delay
                    
                    if (!rttmDelayEnabled) {
                        // If RTTM is disabled, instantly alarm for training purposes
                        setAlarmState('LEAK_EVT', true, ev.msg, 'Priority 1', ev.tag);
                    }
                    // Note: If RTTM is enabled, we no longer push a delayed alarm! 
                    // The LDS will natively catch it when the fluid loss crosses our thresholds.
                } else if (ev.type === 'DISCRETE') {
                    setAlarmState(ev.id || 'EVT_' + sessionSeconds, true, ev.msg, ev.severity, ev.tag);
                }
                scenarioQueue.splice(i, 1);
            }
        }

        // TRANSIENT RAMP: Tear the pipe open over ~20 seconds
        if (activeLeakNode && currentLeakK > activeLeakSize) {
            // Drop resistance by 45% per tick for a faster, sharper rupture signature
            currentLeakK = Math.max(activeLeakSize, currentLeakK * 0.55); 
        }

        // Q1 Digital Twin Visuals: Tied to physical thresholds instead of a time delay
        // FIX: Now we explicitly check the active alarm array. Q1 won't trigger until a real LDS alarm drops!
        const ldsTripped = liveAlarms.some(a => a.id.startsWith('LDS_') && a.active);
        const showLeakVisuals = activeLeakNode && (!rttmDelayEnabled || ldsTripped);
        
        const liveHglEl = document.getElementById('hgl-line');
        if (liveHglEl) liveHglEl.style.display = showLeakVisuals ? "none" : "block";
        const liveFlowEl = document.getElementById('flow-line');
        if (liveFlowEl) liveFlowEl.style.display = showLeakVisuals ? "none" : "block";

        let leakWarnEl = document.getElementById('q1-leak-warning');
        if (showLeakVisuals) {
            if (!leakWarnEl) {
                leakWarnEl = document.createElement('div');
                leakWarnEl.id = 'q1-leak-warning';
                
                // FIX: Stripped custom styles and replaced with native Tailwind border and pulse animations
                leakWarnEl.className = 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#F1F1F1] text-[#333333] px-4 py-2 text-[12px] font-bold text-center z-30 shadow-sm border-2 border-[#ba1a1a] animate-pulse';
                
                leakWarnEl.innerHTML = 'LEAK ALARM ACTIVE<br>CALCULATED PRESSURES & FLOWS INVALID';
                
                document.getElementById('q1-container').appendChild(leakWarnEl);
                
                // Auto-switch Q2 to Imbalance Trend immediately upon visual confirmation
                const tabBtnTrends = document.getElementById('tab-btn-trends');
                if (tabBtnTrends) tabBtnTrends.click();
                
                const imbBtn = document.querySelector('[data-trend="IMB"]');
                if (imbBtn) imbBtn.click();
            }
            leakWarnEl.style.display = 'block';
        } else if (leakWarnEl) {
            leakWarnEl.style.display = 'none';
        }

        // Update Sim Time UI
        const timeStr = new Date(sessionSeconds * 1000).toISOString().substr(11, 8);
        const uiTime = document.getElementById('sys-time-text');
        if (uiTime) uiTime.innerText = timeStr;

        // System Heartbeat Pulse
        const hb = document.getElementById('sys-heartbeat');
        if (hb) hb.style.opacity = (sessionSeconds % 2 === 0) ? '1' : '0.1';

        // Update Q1 Time Widget
        const q1SimTime = document.getElementById('q1-sim-time');
        if (q1SimTime) q1SimTime.innerText = timeStr;
        
        const q1ModelTime = document.getElementById('q1-model-time');
        if (q1ModelTime) {
            // Updated to match our new 60-second RTTM calculation lag
            const modelSecs = Math.max(0, sessionSeconds - 60);
            q1ModelTime.innerText = new Date(modelSecs * 1000).toISOString().substr(11, 8);
        }

        // Hide predict lines if running live
        const dashedHgl = document.getElementById('hgl-line-predict');
        if (dashedHgl) dashedHgl.style.display = 'none';
        
        const dashedFlow = document.getElementById('flow-line-predict');
        if (dashedFlow) dashedFlow.style.display = 'none';

        // Update ground profile visuals and MAOH Polygon
        const groundPoly = document.getElementById('ground-polygon') || document.querySelector('#q1-container svg polygon');
        const maohPoly = document.getElementById('maoh-polygon');
        
        let profilePoints = [];
        if (activeProfile === 'FLAT') {
            if (groundPoly) groundPoly.setAttribute('points', '0,5000 160,5000 0,5000');
            profilePoints = [[0, 0], [160, 0]];
        } else {
            if (groundPoly) groundPoly.setAttribute('points', '0,3000 10,2600 40,3050 50,3200 80,2900 90,2800 150,4800 160,5000 0,5000');
            profilePoints = [[0, 2000], [10, 2400], [40, 1950], [50, 1800], [80, 2100], [90, 2200], [150, 200], [160, 0]];
        }

        if (maohPoly) {
            // 100 ft of head = SG * 43.3 PSI
            const maohHeadFt = (1000 * 100) / (activeSG * 43.3);
            let maohPath = profilePoints.map(pt => {
                const y = Math.max(0, 5000 - (pt[1] + maohHeadFt));
                return `${pt[0]},${y.toFixed(1)}`;
            }).join(' ');
            
            // Close the polygon along the top edge of the SVG to shade the area ABOVE the MAOH limit
            maohPath += ` 160,0 0,0`;
            maohPoly.setAttribute('points', maohPath);
        }

        // Commit PID changes to actual live variables
        rpmA = simRpmA; rpmB = simRpmB; rpmC = simRpmC;
        prevErrorA = simPrevErrA; prevErrorB = simPrevErrB; prevErrorC = simPrevErrC;

        // Mass Transports (Running at true 1:1 scale)
        tankVolD += (rawFlowD / 3600) * 1.5; 
        if (tankVolD > maxTankVolD) tankVolD = maxTankVolD;
        
        tankVolA -= (rawFlowA / 3600) * 1.5;
        if (tankVolA < 0) tankVolA = 0;
        
        meterVolA += (rawFlowA / 3600) * 1.5;
        if (meterVolA > meterBatchSize) meterVolA = 0; // Wrap around every 10k batch
        
        meterVolD += (rawFlowD / 3600) * 1.5;
        if (meterVolD > meterBatchSize) meterVolD = 0; // Wrap around every 10k batch

        const sliderUI = document.getElementById('slider-rpm');
        const valUI = document.getElementById('val-rpm');
        if (sliderUI && valUI) {
            const avgRpm = Math.round((rpmA + rpmB + rpmC) / 3);
            sliderUI.value = avgRpm;
            valUI.innerText = avgRpm + '% (AUTO)';
        }

        const getNoise = () => (Math.random() - 0.5) * 0.4;

        const epState = {
            pressADisc: rawPressADisc + getNoise(), pressBSuct: rawPressBSuct + getNoise(),
            pressBDisc: rawPressBDisc + getNoise(), pressCSuct: rawPressCSuct + getNoise(),
            pressCDisc: rawPressCDisc + getNoise(), pressDSuct: rawPressDSuct + getNoise(),
            flowA: rawFlowA + getNoise(), flowD: rawFlowD + getNoise(), pressASuct: rawPressASuct + getNoise(),
            hA_Suct: hA_Suct, hA_Disc: hA_Disc, hB_Suct: hB_Suct, hB_Disc: hB_Disc,
            hC_Suct: hC_Suct, hC_Disc: hC_Disc, hD: hD,
            rpmA: simRpmA, rpmB: simRpmB, rpmC: simRpmC
        };

        if (flushBufferNextTick) {
            propagationBuffer = Array(MAX_DELAY_TICKS).fill(epState);
            flushBufferNextTick = false; 
        } else {
            propagationBuffer.unshift(epState);
            if (propagationBuffer.length > MAX_DELAY_TICKS) propagationBuffer.pop();
        }

        // ==========================================
        // 5. DYNAMIC MOC DELAY (Faking Speed of Sound)
        // ==========================================
        // Calculates delay ticks (seconds) based on distance from the waveOrigin
        // Liquid transient wave speed: 1.5 seconds per mile
        const WAVE_SPEED = 1.5; 

        const delayA = Math.min(MAX_DELAY_TICKS - 1, Math.round(Math.abs(0 - waveOrigin) * WAVE_SPEED));
        const delayB = Math.min(MAX_DELAY_TICKS - 1, Math.round(Math.abs(40 - waveOrigin) * WAVE_SPEED));
        const delayC = Math.min(MAX_DELAY_TICKS - 1, Math.round(Math.abs(80 - waveOrigin) * WAVE_SPEED));
        const delayD = Math.min(MAX_DELAY_TICKS - 1, Math.round(Math.abs(160 - waveOrigin) * WAVE_SPEED));

        // Fallback to [0] if the buffer isn't full yet (e.g., right after startup)
        const stateA = propagationBuffer[delayA] || propagationBuffer[0];
        const stateB = propagationBuffer[delayB] || propagationBuffer[0];
        const stateC = propagationBuffer[delayC] || propagationBuffer[0];
        const stateD = propagationBuffer[delayD] || propagationBuffer[0];
        const liveState = propagationBuffer[0]; // Used to extract immediate local equipment effects

        // Map UI variables to their specific delayed timeline
        let flowA = stateA.flowA; const pressASuct = stateA.pressASuct;
        const pressBSuct = stateB.pressBSuct; 
        const pressCSuct = stateC.pressCSuct; 
        
        // Decouple delivery flow: use delayed wave, but instantly choke it based on local PCV setpoint
        const pcvClosureFactor = Math.max(0, 1 - ((spPressD - 100) / 700)); // 1.0 at 100 PSI, 0.0 at 800 PSI
        const flowD = stateD.flowD * pcvClosureFactor;

        // Decouple source flow: gracefully spin down flow A in tandem with the VFDs to override downhill gravity drafting
        if (esdActive && esdTick < 120) {
            flowA = flowA * Math.max(0, 1 - (esdTick / 120));
        } else if (simRpmA < 1) {
            flowA = 0; // Hard clamp when pump is fully off
        }

        // FIX: Local pump head and local PCV setpoints should display instantly ONLY when actively commanded (ESD/Trip),
        // otherwise they should continue to ride the delayed fluid wave so leaks appear chronologically!
        const pressADisc = stateA.pressASuct + (liveState.pressADisc - liveState.pressASuct); // A is always live
        const pressBDisc = (esdActive || pumpBTripped) ? stateB.pressBSuct + (liveState.pressBDisc - liveState.pressBSuct) : stateB.pressBDisc;
        const pressCDisc = (esdActive || pumpCTripped) ? stateC.pressCSuct + (liveState.pressCDisc - liveState.pressCSuct) : stateC.pressCDisc;
        const pressDSuct = Math.max(stateD.pressDSuct, spPressD); // Local PCV backpressure acts instantly
        
        // Delay the visual VFD % to match the pressure wave unless local equipment is actively tripping
        const dispRpmA = rpmA; 
        const dispRpmB = (esdActive || pumpBTripped) ? rpmB : (stateB.rpmB || rpmB);
        const dispRpmC = (esdActive || pumpCTripped) ? rpmC : (stateC.rpmC || rpmC);

        const bActive = rpmB > 1 && !esdActive;
        const cActive = rpmC > 1 && !esdActive;

        // CAVITATION / LOW SUCTION TRIPS (60-Second On-Delay Timer)
        if (pressBSuct < 5 && bActive) {
            tripTimerB++;
            if (tripTimerB >= 60) pumpBTripped = true;
        } else {
            tripTimerB = 0; // Reset timer if pressure recovers or pump is intentionally stopped
        }

        if (pressCSuct < 5 && cActive) {
            tripTimerC++;
            if (tripTimerC >= 60) pumpCTripped = true;
        } else {
            tripTimerC = 0; // Reset timer if pressure recovers or pump is intentionally stopped
        }

        // ANALOG LIMIT ALARMS (Checked every 1.0s)
        setAlarmState('LO_SUCT_B', pressBSuct < 30 && pressBSuct >= 5 && bActive, 'LO SUCT PRESS: STATION B', 'Priority 2', 'TAG_SUCT_B');
        setAlarmState('LO_SUCT_C', pressCSuct < 30 && pressCSuct >= 5 && cActive, 'LO SUCT PRESS: STATION C', 'Priority 2', 'TAG_SUCT_C');
        setAlarmState('TRIP_SUCT_B', pumpBTripped, 'PUMP B TRIPPED: LO-LO SUCTION', 'Priority 1', 'TAG_SUCT_B');
        setAlarmState('TRIP_SUCT_C', pumpCTripped, 'PUMP C TRIPPED: LO-LO SUCTION', 'Priority 1', 'TAG_SUCT_C');
        setAlarmState('HI_VIB_B', pressBSuct < 15 && pressBSuct >= 5 && bActive, 'PUMP B HI VIBRATION (CAVITATION)', 'Priority 3', 'TAG_VIB_B');
        setAlarmState('HI_VIB_C', pressCSuct < 15 && pressCSuct >= 5 && cActive, 'PUMP C HI VIBRATION (CAVITATION)', 'Priority 3', 'TAG_VIB_C');
        
        // For Q1 RTTM Graphics, we pull from 60 ticks ago to perfectly match our new 1-minute buffer
        const visA = rttmDelayEnabled ? (propagationBuffer[60] || propagationBuffer[0]) : stateA;
        const visB = rttmDelayEnabled ? (propagationBuffer[60] || propagationBuffer[0]) : stateB;
        const visC = rttmDelayEnabled ? (propagationBuffer[60] || propagationBuffer[0]) : stateC;
        const visD = rttmDelayEnabled ? (propagationBuffer[60] || propagationBuffer[0]) : stateD;

        // Calculate instant local head for the pumps and PCV to reflect equipment states immediately in Q1
        const localHeadB_Disc = (esdActive || pumpBTripped) ? visB.hB_Suct + ((liveState.pressBDisc - liveState.pressBSuct) / (0.433 * currentSG)) : visB.hB_Disc;
        const localHeadC_Disc = (esdActive || pumpCTripped) ? visC.hC_Suct + ((liveState.pressCDisc - liveState.pressCSuct) / (0.433 * currentSG)) : visC.hC_Disc;
        const localHeadD = visD.hD + ((Math.max(visD.pressDSuct, spPressD) - visD.pressDSuct) / (0.433 * currentSG));

        // HGL and Flow Visual Lines (Properly using delayed visual states)
        latestHGLTarget = [
            { x: 0,   y: Math.max(0, 5000 - visA.hA_Suct) }, { x: 0,   y: Math.max(0, 5000 - visA.hA_Disc) },
            { x: 40,  y: Math.max(0, 5000 - visB.hB_Suct) }, { x: 40,  y: Math.max(0, 5000 - localHeadB_Disc) }, 
            { x: 80,  y: Math.max(0, 5000 - visC.hC_Suct) }, { x: 80,  y: Math.max(0, 5000 - localHeadC_Disc) }, 
            { x: 160, y: Math.max(0, 5000 - localHeadD) }       
        ];

        // Ensure Q1 Flow line respects the local PCV closure
        const visFlowD = visD.flowD * Math.max(0, 1 - ((spPressD - 100) / 700));

        latestFlowTargetY = [
            5000 - ((visA.flowA / 3000) * 5000), 5000 - ((visB.flowA / 3000) * 5000), 
            5000 - ((visC.flowA / 3000) * 5000), 5000 - ((visFlowD / 3000) * 5000)  
        ];

        // --- WARMUP TRAP ---
        if (isWarmup) {
            isStepTick = false;
            return; 
        }

        if (!rttmDelayEnabled) {
            const pathD = latestHGLTarget.map((pt, i) => (i === 0 ? 'M ' : 'L ') + pt.x + ' ' + pt.y.toFixed(1)).join(' ');
            const hglEl = document.getElementById('hgl-line');
            if (hglEl) hglEl.setAttribute('d', pathD);

            const flowEl = document.getElementById('flow-line');
            if (flowEl) flowEl.setAttribute('d', `M 0 ${latestFlowTargetY[0].toFixed(1)} L 40 ${latestFlowTargetY[1].toFixed(1)} L 80 ${latestFlowTargetY[2].toFixed(1)} L 160 ${latestFlowTargetY[3].toFixed(1)}`);
        }

        const bindUI = (id, val, isLocked = false) => {
            const el = document.getElementById(id);
            if (el) {
                // API 1165: Display magenta dashes for invalid/negative pressures (Rupture signature)
                if (val < 0) {
                    el.innerText = '---';
                    el.style.color = '#9C27B0'; // Muted Magenta
                } else {
                    el.innerText = val.toFixed(0);
                    el.style.color = isLocked ? '#888888' : ''; // Reset to standard font color OR lock to grey
                }
                
                const prevVal = previousTelemetry[id] !== undefined ? previousTelemetry[id] : val;
                const rawDelta = val - prevVal;
                previousTelemetry[id] = val; 

                // FAST ATTACK / SLOW DECAY RoC LOGIC
                let currentRoc = rocState[id] || 0;
                
                if (Math.abs(rawDelta) >= Math.abs(currentRoc)) {
                    currentRoc = rawDelta; 
                } else {
                    currentRoc = currentRoc * 0.85; // 15% decay per tick leaves a visual "echo"
                }
                
                if (Math.abs(currentRoc) < 0.2) currentRoc = 0;
                rocState[id] = currentRoc;

                const barContainer = el.parentElement.querySelector('.center-zero-bar');
                if (barContainer) {
                    let negBar = barContainer.querySelector('.bar-fill-neg');
                    let posBar = barContainer.querySelector('.bar-fill-pos');
                    
                    if (!negBar) { negBar = document.createElement('div'); negBar.className = 'bar-fill-neg'; barContainer.appendChild(negBar); }
                    if (!posBar) { posBar = document.createElement('div'); posBar.className = 'bar-fill-pos'; barContainer.appendChild(posBar); }

                    const fillPercent = Math.min((Math.abs(currentRoc) / ROC_MAX_DELTA) * 50, 50);

                    if (currentRoc > 0.5) { posBar.style.width = fillPercent + '%'; negBar.style.width = '0%'; } 
                    else if (currentRoc < -0.5) { negBar.style.width = fillPercent + '%'; posBar.style.width = '0%'; } 
                    else { posBar.style.width = '0%'; negBar.style.width = '0%'; }
                }
            }
        };

        // Data bindings
        bindUI('val-sta-a-suct', pressASuct); bindUI('val-sta-a-vfd', dispRpmA); bindUI('val-sta-a-disc', pressADisc); bindUI('val-sta-a-flow', flowA);
        bindUI('val-sta-b-suct', pressBSuct); bindUI('val-sta-b-vfd', dispRpmB); bindUI('val-sta-b-disc', pressBDisc);
        bindUI('val-sta-c-suct', pressCSuct); bindUI('val-sta-c-vfd', dispRpmC); bindUI('val-sta-c-disc', pressCDisc);
        
        // Calculate PCV % based on the newly calculated flowD
        const pcvD = Math.max(0, Math.min(100, (flowD / 2500) * 100)); 
        bindUI('val-sta-d-suct', pressDSuct); bindUI('val-sta-d-pcv', pcvD); bindUI('val-sta-d-flow', flowD);
        bindUI('l3-val-d-sp', spPressD, true); // Q2 Delivery Setpoint Target (Locked Color)
        bindUI('val-sta-d-sp-q3', spPressD, true); // Q3 Delivery Setpoint Target (Locked Color)
        
        bindUI('l3-val-a-suct', pressASuct); bindUI('l3-val-a-disc', pressADisc); bindUI('l3-val-a-flow', flowA);
        bindUI('l3-val-a-rpm-sp', dispRpmA); bindUI('l3-val-a-rpm', dispRpmA);
        
        // TANK A: Vol counts DOWN, Rem counts UP (What was delivered)
        bindUI('l3-val-a-tank-flow', flowA); bindUI('l3-val-a-vol', tankVolA); bindUI('l3-val-a-rem-tank', maxTankVolA - tankVolA);
        // METER A: Vol counts UP, Rem counts DOWN
        bindUI('l3-val-a-vol-meter', meterVolA); bindUI('l3-val-a-rem-meter', meterBatchSize - meterVolA); 

        bindUI('l3-val-d-suct', pressDSuct); bindUI('l3-val-d-flow', flowD); 
        
        // TANK D: Vol counts UP, Rem counts DOWN (Empty Space)
        bindUI('l3-val-d-tank-flow', flowD); bindUI('l3-val-d-vol', tankVolD); bindUI('l3-val-d-rem-tank', maxTankVolD - tankVolD);
        // METER D: Vol counts UP, Rem counts DOWN
        bindUI('l3-val-d-vol-meter', meterVolD); bindUI('l3-val-d-rem-meter', meterBatchSize - meterVolD);

        const tankElD = document.getElementById('l3-tank-d');
        if (tankElD) tankElD.innerHTML = ObjectLibrary.getTank((tankVolD / maxTankVolD) * 100, 'L3');
        
        const tankElA = document.getElementById('l3-tank-a');
        if (tankElA) tankElA.innerHTML = ObjectLibrary.getTank((tankVolA / maxTankVolA) * 100, 'L3');

        const updatePumpIcon = (id, rpm, size = 'L2') => {
            const el = document.getElementById(id);
            if (!el) return;
            let state = rpm > 1 ? "RUNNING" : "STOPPED";
            
            if (esdActive) {
                if (esdTick < 120) state = "TRANSITION"; // 2 Minutes
                else state = "STOPPED";
            }
            el.innerHTML = ObjectLibrary.getPump(state, size);
        };

        updatePumpIcon('icon-sta-a', dispRpmA, 'L2'); updatePumpIcon('l3-pump-a', dispRpmA, 'L3');
        updatePumpIcon('icon-sta-b', dispRpmB, 'L2'); updatePumpIcon('icon-sta-c', dispRpmC, 'L2');
        
        const updateMlvIcons = () => {
            let state = "OPEN";
            if (esdActive) {
                if (esdTick < 180) state = "TRANSITION"; // 3 Minutes
                else state = "CLOSED";
            }
            [20, 40, 60, 80, 120, 150].forEach(mile => {
                const el = document.getElementById(`mlv-${mile}`);
                if (el) el.innerHTML = ObjectLibrary.getGateValve(state, 'L2');
            });
            
            // visually de-energize the pipeline when valves are fully closed
            const pipeEl = document.getElementById('q1-mainline-pipe');
            if (pipeEl) pipeEl.style.backgroundColor = state === "CLOSED" ? '#A0A0A0' : '#555555';
        };
        updateMlvIcons();

        // ==========================================
        // COMPENSATED MASS BALANCE (Rate-Based Pseudo-RTTM)
        // ==========================================
        
        // --- 60-SECOND RTTM BUFFERING ---
        // Push live physics data into the back of the line
        rttmBuffer.push({ pressADisc, pressBSuct, pressBDisc, pressCSuct, pressCDisc, pressDSuct, flowA, flowD, actualLeakFlow });
        if (rttmBuffer.length > 60) rttmBuffer.shift(); // Keep exactly 60 seconds of history

        // If RTTM Delay is enabled, feed the 60-second OLD data to the Leak Detection calculations!
        const rttmData = rttmDelayEnabled && rttmBuffer.length === 60 ? rttmBuffer[0] : rttmBuffer[rttmBuffer.length - 1];
        
        // 1. Calculate Smoothed Average Pipeline Pressure (Using Buffered Data!)
        const rawAvgPress = (rttmData.pressADisc + rttmData.pressBSuct + rttmData.pressBDisc + rttmData.pressCSuct + rttmData.pressCDisc + rttmData.pressDSuct) / 6;
        if (smoothedAvgPress === 0) smoothedAvgPress = rawAvgPress; 
        smoothedAvgPress = (smoothedAvgPress * 0.90) + (rawAvgPress * 0.10);
        
        if (prevAvgPress === 0) prevAvgPress = smoothedAvgPress; 
        const deltaP_sec = smoothedAvgPress - prevAvgPress; 
        prevAvgPress = smoothedAvgPress;

        // 2. Base Flow Rates (m³/h) (Using Buffered Data!)
        const volFlowA = rttmData.flowA; // IN
        const volFlowD = rttmData.flowD; // OUT
        
        // Raw Imbalance Rate (m³/h). Sign: In > Out = Negative (Leak)
        const rawImbalanceRate = volFlowD - volFlowA;

        // 3. Linepack Compensation Rate (m³/h)
        // Increased cushion to simulate a highly compressible fluid (e.g. 2.5 m³ of stretch/squish per 1 PSI change)
        const LINEPACK_COEF = 2.5; 
        const packRateHr = (deltaP_sec * 3600) * LINEPACK_COEF;
        
        // FIX: We must ADD the negative pack rate to offset a positive natural draft
        const compensatedImbalanceRate = rawImbalanceRate + packRateHr;

        // 4. Exponential Moving Average (EMA) smoothing for the Rates
        // This converts the wild tick-by-tick rates into smooth 5-min and 1-hour Calculated Leak Rates
        imb5m_acc = imb5m_acc + (compensatedImbalanceRate - imb5m_acc) / 300;
        imb1h_acc = imb1h_acc + (compensatedImbalanceRate - imb1h_acc) / 3600;

        // --- CUMULATIVE VOLUME BALANCE (CUSUM) ---
        // Convert hourly rate (m³/h) to per-second volume (m³) and integrate.
        // We strictly use the rawImbalanceRate here. Using compensated rate causes the CUSUM to falsely 
        // drain when the PID controller recovers the pipeline pressure (false positive linepack).
        cumulativeImbalanceM3 -= (rawImbalanceRate / 3600);
        
        // The "Drift Bleed": If the raw imbalance is tiny (normal meter noise), 
        // gently bleed the accumulator back to 0 (0.1% per sec) so we don't trigger false alarms over 24 hours.
        if (Math.abs(rawImbalanceRate) < 20) {
            cumulativeImbalanceM3 *= 0.999; 
        }
        
        // Clamp to 0 to prevent negative accumulation from confusing the chart
        if (cumulativeImbalanceM3 < 0) cumulativeImbalanceM3 = 0;

        // --- NATURAL LEAK DETECTION (LDS) MULTI-TIERED ALARMS ---
        if (rttmDelayEnabled) { 
            // Tier 1: Rupture Net (Requires 120 continuous seconds to ignore shockwaves)
            if (imb5m_acc < -400) {
                ldsTimer5m++;
                if (ldsTimer5m >= 120) setAlarmState('LDS_RATE_5M', true, 'CPM RATE BALANCE: > 400 m³/h LOSS (5 MIN WINDOW)', 'Priority 1', 'TAG_LDS');
            } else {
                ldsTimer5m = 0; // Reset timer if the rate recovers
            }
            
            // Tier 2: Medium Net (Requires 120 continuous seconds to ignore shockwaves)
            if (imb1h_acc < -100) {
                ldsTimer1h++;
                if (ldsTimer1h >= 120) setAlarmState('LDS_RATE_1H', true, 'CPM RATE BALANCE: > 100 m³/h LOSS (1 HR WINDOW)', 'Priority 1', 'TAG_LDS');
            } else {
                ldsTimer1h = 0; // Reset timer if the rate recovers
            }
            
            // Tier 3: Weep Net (Volume naturally builds over time, no timer needed)
            if (cumulativeImbalanceM3 > 200) setAlarmState('LDS_VOL_CUSUM', true, 'CPM VOLUME BALANCE: > 200 m³ ACCUMULATED LOSS', 'Priority 1', 'TAG_LDS');
        }

        // True Leak Rate (m³/h) mapped directly for the validation pen
        // FIX: Use the buffered data so the red reference line is delayed by 60s exactly like the calculations!
        const trueLeakRateHr = rttmData.actualLeakFlow;

        trendData.push({ pressADisc, pressBSuct, pressBDisc, pressCSuct, pressCDisc, pressDSuct, flowA, flowD, imb5m: imb5m_acc, imb1h: imb1h_acc, leakVol: trueLeakRateHr, cusum: cumulativeImbalanceM3 });
        
        if (trendData.length > TREND_MAX_POINTS) trendData.shift();
        drawTrend();

        if (mqttClient && mqttClient.connected) {
            const lastVal = lastPublishedMQTT['sta-b-suct'];
            if (lastVal === undefined || Math.abs(pressBSuct - lastVal) >= MQTT_DEADBAND) {
                const payload = { value: parseFloat(pressBSuct.toFixed(2)), units: "PSI", pods_metadata: { feature_type: "PumpStation", mile_post: 40, status: rpmB > 1 ? "RUNNING" : "STOPPED" }, timestamp: new Date().toISOString() };
                mqttClient.publish('WPSS/Echo1/Line160/StationB/SuctionPressure', JSON.stringify(payload));
                lastPublishedMQTT['sta-b-suct'] = pressBSuct;
            }
        }

        isStepTick = false; 

    } catch (error) {
        console.error("🔴 ENGINE ERROR ON TICK:", error); 
    }
}

// ==========================================
// 5. MQTT NETWORKING (Edge Emulator & SIGINT)
// ==========================================
let mqttClient = null;

function connectToBroker(brokerUrl, username, password) {
    if (mqttClient) {
        mqttClient.end();
        console.log("🔌 Existing MQTT connection terminated.");
    }

    const statusDot = document.getElementById('mqtt-status-dot');
    const connectBtn = document.getElementById('btn-mqtt-connect');
    
    console.log(`🌐 Attempting BYOB MQTT Connection to: ${brokerUrl}`);
    
    const options = {
        connectTimeout: 4000,
        reconnectPeriod: 1000,
        protocolVersion: 4
    };
    if (username) options.username = username;
    if (password) options.password = password;

    mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on('connect', () => {
        console.log('✅ MQTT Connected!');
        if (statusDot) statusDot.style.backgroundColor = '#006a6a'; // Teal/Green
        if (connectBtn) connectBtn.innerText = 'Broker Online';
        
        // Subscribe to incoming remote commands
        mqttClient.subscribe('WPSS/Echo1/Commands', (err) => {
            if (!err) console.log('📡 Subscribed to command topic: WPSS/Echo1/Commands');
        });

        // Subscribe to AI SIGINT Radio Feed
        mqttClient.subscribe('telemetry/sigint', (err) => {
            if (!err) console.log('🚨 Subscribed to AI Intelligence feed: telemetry/sigint');
        });
    });

    // Handle incoming messages from the broker
    mqttClient.on('message', (topic, message) => {
        
        // --- NEW: AI RADIO INTERCEPT HANDLER ---
        if (topic === 'telemetry/sigint') {
            try {
                const intelligence = JSON.parse(message.toString());
                const category = intelligence.category || intelligence.event_type || 'SIGINT';
                const summary = intelligence.summary || intelligence.description || 'Unknown Intelligence';

                const alertId = 'SIGINT_' + Date.now();
                setAlarmState(alertId, true, `[${category.toUpperCase()}] ${summary}`, 'Priority 1', null);
                
                console.log(`🎙️ [RADIO INTERCEPT MAPPED TO SCADA]: ${summary}`);

            } catch (e) {
                console.error("🔴 Failed to parse SIGINT payload.", e);
            }
        }

        // --- EXISTING: PIPELINE COMMAND HANDLER ---
        else if (topic === 'WPSS/Echo1/Commands') {
            try {
                const payload = JSON.parse(message.toString());
                console.log("📥 Incoming MQTT Command:", payload);
                
                if (payload.command === 'ESD') {
                    // Trigger Global ESD Sequence
                    currentMode = 'PAUSED';
                    updateSysStatusUI();
                    setAlarmState('MQTT_ESD', true, 'REMOTE ESD TRIGGERED VIA MQTT', 'Priority 1', 'TAG_SYS_INIT');
                    
                    // Visually latch all ESD buttons
                    const esdBtns = [...document.querySelectorAll('button')].filter(b => b.innerText.trim() === 'ESD');
                    esdBtns.forEach(b => { b.style.backgroundColor = '#ba1a1a'; b.style.color = '#ffffff'; });
                    
                    alert('🚨 EXTERNAL ESD COMMAND RECEIVED via MQTT 🚨');
                } 
                else if (payload.command === 'SETPOINT' && payload.station === 'A' && typeof payload.value === 'number') {
                    // Remote Setpoint Injection
                    pendingSpPressA = payload.value;
                    const uiSpA = document.getElementById('ui-sp-a');
                    if (uiSpA) uiSpA.innerText = pendingSpPressA;
                    
                    // Auto-commit if the pipeline is actively running
                    if (currentMode === 'RUNNING') spPressA = pendingSpPressA;
                    console.log(`🎯 Remote Setpoint Update: Station A -> ${payload.value} PSI`);
                }
                else if (payload.command === 'LEAK') {
                    // Remote Leak Scenario Injection
                    const delay = payload.delay || 0;
                    const events = SCENARIO_LIBRARY['leak_small_70']; // Default to active scenario
                    
                    if (events) {
                        events.forEach(ev => scenarioQueue.push({ ...ev, triggerTick: sessionSeconds + delay + ev.offset }));
                        
                        // Auto-enable RTTM Lag if injecting a leak scenario
                        if (!rttmDelayEnabled) {
                            const rttmBtn = document.getElementById('btn-rttm-toggle');
                            if (rttmBtn) rttmBtn.click(); 
                        }
                        console.log(`🌊 Remote Scenario Injection: LEAK_70 triggered via MQTT (Delay: ${delay}s)`);
                    }
                }
            } catch (e) {
                console.error("🔴 Failed to parse incoming MQTT command. Expected JSON.", e);
            }
        }
    });

    mqttClient.on('error', (err) => {
        console.error('🔴 MQTT Connection Error:', err);
        if (statusDot) statusDot.style.backgroundColor = '#ba1a1a'; // Red
        if (connectBtn) connectBtn.innerText = 'Connection Failed';
    });
    
    mqttClient.on('close', () => {
        if (statusDot) statusDot.style.backgroundColor = '#555555'; // Grey
    });
}

// ==========================================
// 6. POPULATE UI STYLE GUIDE (LEGEND)
// ==========================================
function initLegend() {
    const l3Run = document.getElementById('leg-pump-l3-run');
    if (l3Run) l3Run.innerHTML = ObjectLibrary.getPump('RUNNING', 'L3');
    const l3Stop = document.getElementById('leg-pump-l3-stop');
    if (l3Stop) l3Stop.innerHTML = ObjectLibrary.getPump('STOPPED', 'L3');
    const l3Trans = document.getElementById('leg-pump-l3-trans');
    if (l3Trans) l3Trans.innerHTML = ObjectLibrary.getPump('TRANSITION', 'L3');

    const l2Run = document.getElementById('leg-pump-l2-run');
    if (l2Run) l2Run.innerHTML = ObjectLibrary.getPump('RUNNING', 'L2');
    const l2Stop = document.getElementById('leg-pump-l2-stop');
    if (l2Stop) l2Stop.innerHTML = ObjectLibrary.getPump('STOPPED', 'L2');
    const l2Trans = document.getElementById('leg-pump-l2-trans');
    if (l2Trans) l2Trans.innerHTML = ObjectLibrary.getPump('TRANSITION', 'L2');

    const valveOpen = document.getElementById('leg-valve-gate-open');
    if (valveOpen) valveOpen.innerHTML = ObjectLibrary.getGateValve('OPEN', 'L3');
    const valveClosed = document.getElementById('leg-valve-gate-closed');
    if (valveClosed) valveClosed.innerHTML = ObjectLibrary.getGateValve('CLOSED', 'L3');
    const valveTrans = document.getElementById('leg-valve-gate-trans');
    if (valveTrans) valveTrans.innerHTML = ObjectLibrary.getGateValve('TRANSITION', 'L3');

    const valvePCV = document.getElementById('leg-valve-pcv');
    if (valvePCV) valvePCV.innerHTML = ObjectLibrary.getPCV('L3');

    const l3MeterFE = document.getElementById('l3-meter-fe-d');
    if (l3MeterFE) l3MeterFE.innerHTML = ObjectLibrary.getFlowMeter('L3');
    
    // Injecting Meter A for the new Level 3 Station A display
    const l3MeterFE_A = document.getElementById('l3-meter-fe-a');
    if (l3MeterFE_A) l3MeterFE_A.innerHTML = ObjectLibrary.getFlowMeter('L3');
    
    const l3ValvePCV = document.getElementById('l3-valve-pcv-d');
    if (l3ValvePCV) l3ValvePCV.innerHTML = ObjectLibrary.getPCV('L3');
    
    const l3Ocean = document.getElementById('l3-ocean-d');
    if (l3Ocean) l3Ocean.innerHTML = ObjectLibrary.getOcean('L3');
    
    // Inject Flow Meter for Option 3 Proximity Layout (Legend)
    const meterFE = document.getElementById('leg-meter-fe');
    if (meterFE) meterFE.innerHTML = ObjectLibrary.getFlowMeter('L3');
    
    const lineMain = document.getElementById('leg-line-main');
    if (lineMain) lineMain.style = ObjectLibrary.getLineDef('MAIN');
    const lineSecondary = document.getElementById('leg-line-secondary');
    if (lineSecondary) lineSecondary.style = ObjectLibrary.getLineDef('SECONDARY');

    // Inject Tank for Option 3 Proximity Layout (Legend)
    const legTank = document.getElementById('leg-tank');
    if (legTank) legTank.innerHTML = ObjectLibrary.getTank(50, 'L3');
}
// ==========================================
// 7. HIGH-PERFORMANCE NATIVE CANVAS TRENDING
// ==========================================
function drawTrend() {
    const canvas = document.getElementById('trend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);
    if (trendData.length === 0) return;

    // Extract dynamic dataset based on selection
    let line1 = []; let line2 = []; let line3 = null;
    let scaleMax = 1200; 
    let color1 = '#6A1B9A'; // Default Purple
    let color2 = '#37474F'; // Default Dark Grey
    let color3 = '#555555'; // Default Med Grey
    
    // Grab HTML Legend elements
    const l1 = document.getElementById('trend-leg-1'); 
    const l2 = document.getElementById('trend-leg-2'); 
    const cBox1 = document.getElementById('leg-color-1'); 
    const cBox2 = document.getElementById('leg-color-2');
    const yAx = document.getElementById('trend-y-axis-label');

    if (currentTrendView === 'AB') { scaleMax = 1200; line1 = trendData.map(d => d.pressADisc); line2 = trendData.map(d => d.pressBSuct); }
    if (currentTrendView === 'BC') { scaleMax = 1200; line1 = trendData.map(d => d.pressBDisc); line2 = trendData.map(d => d.pressCSuct); }
    if (currentTrendView === 'CD') { scaleMax = 1200; line1 = trendData.map(d => d.pressCDisc); line2 = trendData.map(d => d.pressDSuct); }
    if (currentTrendView === 'FLOW') { scaleMax = 3000; line1 = trendData.map(d => d.flowA); line2 = trendData.map(d => d.flowD); }
    
    if (currentTrendView === 'IMB') { 
        scaleMax = 3000; // Adjusted to +/- 3000 m³/hr for Full Rupture visualization
        color1 = '#008E97'; // 1 Hour (Heavy/Slow) matches Q1 Calc Head
        color2 = '#00B4CC'; // 5 Min (Fast/Light) matches Q1 Calc Flow
        
        line1 = trendData.map(d => d.imb1h); 
        line2 = trendData.map(d => d.imb5m); 
        line3 = null; // True leak pen removed for production view
        
        if (l1 && l2 && yAx) { 
            l1.innerText = 'DEVIATION RATE (1 HR)'; 
            l2.innerText = 'DEVIATION RATE (5 MIN)'; 
            yAx.innerText = 'UNIT: m³/h'; 
        }
        
        // Show secondary volume chart on Imbalance Tab
        const containerSecondary = document.getElementById('chart-container-secondary');
        if (containerSecondary) containerSecondary.classList.remove('hidden');
    } else {
        // Hide secondary volume chart on all other tabs
        const containerSecondary = document.getElementById('chart-container-secondary');
        if (containerSecondary) containerSecondary.classList.add('hidden');
    }

    // Apply dynamic colors to legend squares
    if (cBox1 && cBox2) { cBox1.style.backgroundColor = color1; cBox2.style.backgroundColor = color2; }

    // Draw Grid & Axes Text
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    if (currentTrendView === 'IMB') {
        ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); // Heavy Center Zero Line
    }
    
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.fillStyle = "#888888";
    
    // Horizontal quartiles & Y-Axis Labels
    for (let i = 1; i < 4; i++) { 
        const y = (height / 4) * i; 
        ctx.moveTo(0, y); ctx.lineTo(width, y); 
        ctx.textAlign = "left"; ctx.textBaseline = "bottom";
        
        if (currentTrendView !== 'IMB') {
            const val = scaleMax - ((scaleMax / 4) * i);
            ctx.fillText(val.toFixed(0), 5, y - 2);
        }
    }
    
    // Draw Y-Axis Min/Max Bounds
    if (currentTrendView === 'IMB') {
        ctx.textAlign = "left";
        ctx.fillText("+" + scaleMax, 5, 12);
        ctx.fillText("0", 5, height / 2 - 2);
        ctx.fillText("-" + scaleMax, 5, height - 20);
    } else {
        ctx.textAlign = "left";
        ctx.fillText(scaleMax.toFixed(0), 5, 12);
        ctx.fillText("0", 5, height - 20);
    }

    // Vertical 1-minute markers & X-Axis Labels
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (let i = 1; i < 10; i++) { 
        const x = (width / 10) * i; 
        ctx.moveTo(x, 0); ctx.lineTo(x, height); 
        ctx.fillText((-10 + i), x - 8, height - 2);
    }
    ctx.stroke();

    // Helper to plot a line
    const plotLine = (data, plotColor, isDashed = false) => {
        if (!data || data.length === 0) return;
        ctx.beginPath();
        ctx.strokeStyle = plotColor;
        ctx.lineWidth = isDashed ? 1.5 : 2;
        if (isDashed) ctx.setLineDash([4, 4]); else ctx.setLineDash([]);
        
        let lastX = 0; let lastY = 0; let lastVal = 0;
        for (let i = 0; i < data.length; i++) {
            // ALWAYS ANCHOR NEWEST DATA TO THE RIGHT EDGE
            const x = width - (((data.length - 1 - i) / TREND_MAX_POINTS) * width);
            
            let y = 0;
            if (currentTrendView === 'IMB') {
                // Map from [-scaleMax, scaleMax] to [height, 0]
                const normalized = (data[i] + scaleMax) / (scaleMax * 2);
                y = height - (normalized * height);
            } else {
                y = height - ((data[i] / scaleMax) * height);
            }
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            
            if (i === data.length - 1) { lastX = x; lastY = y; lastVal = data[i]; }
        }
        ctx.stroke();
        ctx.setLineDash([]); // Reset dash for next line
        
        // Draw Leading Edge Value Tag
        if (data.length > 0) {
            ctx.fillStyle = plotColor;
            ctx.fillRect(lastX - 45, lastY - 10, 45, 20);
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 11px Roboto Mono, monospace";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            ctx.fillText(lastVal.toFixed(0), lastX - 4, lastY + 1);
        }
    };

    plotLine(line1, color1);
    plotLine(line2, color2);
    if (line3) plotLine(line3, color3, true);
    
    // --- DRAW SECONDARY VOLUME CHART (CUSUM) ---
    if (currentTrendView === 'IMB') {
        const volCanvas = document.getElementById('trend-canvas-vol');
        if (volCanvas) {
            const vCtx = volCanvas.getContext('2d');
            const vWidth = volCanvas.width = volCanvas.offsetWidth;
            const vHeight = volCanvas.height = volCanvas.offsetHeight;
            vCtx.clearRect(0, 0, vWidth, vHeight);
            
            const cusumData = trendData.map(d => d.cusum || 0); // Safety fallback
            
            // Auto-scale the volume chart based on the max volume, locked to at least 250 m3
            let maxVol = Math.max(250, Math.max(...cusumData) * 1.2);
            
            // Draw Grid & Axes
            vCtx.strokeStyle = '#E0E0E0';
            vCtx.lineWidth = 1;
            vCtx.beginPath();
            for (let i = 1; i < 4; i++) { 
                const y = (vHeight / 4) * i; 
                vCtx.moveTo(0, y); vCtx.lineTo(vWidth, y); 
            }
            for (let i = 1; i < 10; i++) { 
                const x = (vWidth / 10) * i; 
                vCtx.moveTo(x, 0); vCtx.lineTo(x, vHeight); 
            }
            vCtx.stroke();
            
            // Labels
            vCtx.font = "bold 10px Inter, sans-serif";
            vCtx.fillStyle = "#888888";
            vCtx.textAlign = "left"; vCtx.textBaseline = "bottom";
            vCtx.fillText(maxVol.toFixed(0), 5, 12);
            vCtx.fillText("0", 5, vHeight - 2);
            
            // Plot CUSUM Staircase
            vCtx.beginPath();
            vCtx.strokeStyle = '#00B4CC'; // SCADA Light Blue
            vCtx.lineWidth = 2;
            let lastVX = 0; let lastVY = 0; let lastVVal = 0;
            for (let i = 0; i < cusumData.length; i++) {
                const x = vWidth - (((cusumData.length - 1 - i) / TREND_MAX_POINTS) * vWidth);
                const y = vHeight - ((cusumData[i] / maxVol) * vHeight);
                if (i === 0) vCtx.moveTo(x, y); else vCtx.lineTo(x, y);
                
                if (i === cusumData.length - 1) { lastVX = x; lastVY = y; lastVVal = cusumData[i]; }
            }
            vCtx.stroke();
            
            // Draw Leading Edge Value Tag for CUSUM
            if (cusumData.length > 0) {
                vCtx.fillStyle = '#00B4CC';
                vCtx.fillRect(lastVX - 50, lastVY - 10, 50, 20);
                vCtx.fillStyle = "#FFFFFF";
                vCtx.font = "bold 12px Roboto Mono, monospace";
                vCtx.textAlign = "right";
                vCtx.textBaseline = "middle";
                vCtx.fillText(lastVVal.toFixed(0), lastVX - 4, lastVY + 1);
            }
            
            // Draw Fixed Alarm Threshold Line (200 m3)
            vCtx.beginPath();
            vCtx.strokeStyle = '#008E97'; // SCADA Teal/Green
            vCtx.lineWidth = 1.5;
            vCtx.setLineDash([5, 5]);
            const alarmY = vHeight - ((200 / maxVol) * vHeight);
            if (alarmY > 0 && alarmY < vHeight) {
                vCtx.moveTo(0, alarmY);
                vCtx.lineTo(vWidth, alarmY);
                vCtx.fillStyle = "#777777"; // Standard Object Library Grey
                vCtx.fillText("ALARM THRESHOLD (200 m³)", 5, alarmY - 4);
            }
            vCtx.stroke();
            vCtx.setLineDash([]);
        }
    }
}
// ==========================================
// INITIALIZE EVERYTHING ON STARTUP
// ==========================================
restoreSessionState(false); // Force clean factory defaults on page load
initLegend();
loadPipelineData();
// connectToBroker(); // Manual trigger now required via BYOB UI
initPhysicsEngine();

// ==========================================
// BOOT SEQUENCE AUTOPILOT
// ==========================================
setTimeout(() => {
    // 1. Find and click the CONTROLS tab (searching by text content)
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => {
        if (btn.innerText.includes('CONTROLS')) btn.click();
    });
    
    // 2. Auto-sync the Predictive Calculator to live variables
    const syncBtn = document.getElementById('btn-calc-sync');
    if (syncBtn) syncBtn.click();
    
    // 3. Auto-play the simulator
    const playBtn = document.getElementById('btn-play');
    if (playBtn) playBtn.click();
    
    console.log("🤖 UI Autopilot: Controls Tab Opened, Calculator Synced, and Simulator Started.");
}, 1000); // Wait 1 second to ensure DOM and variables are fully mounted