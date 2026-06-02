# NAIAD1 - The Background Hydraulics Engine

## Project State: Core Extraction / Pre-Alpha Verification
This repository serves as the standalone wrapper designed to isolate fluid dynamics and transient hydraulic calculations from the primary supervisory user interface. It is built to support permissive, modular integration with third-party dashboards.

### Current Capabilities
* **WebAssembly Math Engine:** Powered by a native integration of `epanet-js` to handle complex physical node matrix layouts.
* **Real-Time Transient Model (RTTM):** Formulated to compute physical hydraulic gradients, Darcy-Weisbach absolute roughness losses, and fluid compressibility constants over a multi-station mainline.
* **MOC Speed of Sound Delay:** Simulates a 1.5 seconds-per-mile liquid acoustic surge propagation delay buffer via a dynamic 300-tick FIFO array.
* **ISA 18.2 State Engine:** Hardcoded logic tracking analog Rate-of-Change (RoC) "Fast-Attack / Slow-Decay" visual alarms and automated low-suction cavitation equipment trips.
* **Premium EV-Style Audio Matrix:** Implements the Web Audio API (`SCADA_AUDIO`) to synthesize multi-oscillator alarm chime chords across variable silence intervals (Priority 1–3) to prevent operator sensory fatigue.
* **Edge Telemetry Emulator:** Equipped with standard BYOB MQTT client bindings to dynamically parse commands, pipe remote setpoints, or intercept external JSON intelligence feeds (`telemetry/sigint`).

### Repository Structure
* `/samples`: Contains a mock EPANET `echo1.inp` hydraulic network profile representing an imaginary pipeline model for simulation verification.

### Open Source & Licensing Guardrails
The software components in this directory are structured as a work in public, for the public good. 
* **Engine Scope:** This component specifically encapsulates the underlying mathematical models driving the hydraulics wrapper inside the legacy **ECHO1** layout.
* **Licensing Clarification:** While fully integrated UI assets operate under copyleft guidelines, the decoupled physics processing wrapper within this repository is explicitly distributed as a placeholder under the permissive **MIT License** to foster collaborative development.
