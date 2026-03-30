<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Project Overview
Single-File HTML application designed for Clinical Research Coordinators (CRC) and Clinical Trial Assistants (CTA). It digitalizes clinical trial visit execution, protocol-specific checklists, and operational alerts within a portable, zero-infrastructure environment.

# Technical Architecture
Format: Single-File HTML (Portable).

Stack: HTML5 / CSS3 / Vanilla JavaScript.

Infrastructure: Serverless / Client-side execution.

Persistence: LocalStorage / File-based (Zero database dependency).

# Core Features
Visit Execution: Digitalized scheduling and tracking of protocol visits.

Compliance Checklists: Dynamic protocol-specific task verification.

Automated Alerts: Preventive notifications for window calculations and safety milestones.

Data Portability: Instant deployment via any modern web browser without installation.

# Technical Compliance & Quality by Design
This project adheres to the following principles:

Zero-Infrastructure: Operates independently of server-side environments to bypass IT restrictions in clinical sites.

Idempotency: Core logic ensures that repeated operations yield the same consistent state, preventing data duplication.

Technical Traceability: Structured to maintain integrity during the lifecycle of the clinical trial session.

Security: Client-side processing ensures data remains within the user's controlled environment.

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f5297949-5c19-4360-84c5-8120514e9e04

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
