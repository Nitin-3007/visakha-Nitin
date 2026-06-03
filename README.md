# ViSakha Project Documentation

## 1. Project Overview

**ViSakha** is a full-stack web application designed to act as a robust administrative dashboard and AI-driven knowledge management system. It provides comprehensive tools for managing user conversations, curating knowledge bases, analyzing feedback, and handling team administration. The application features a dynamic frontend interface for data visualization and management, backed by a powerful Express.js API integrated with MongoDB and AI services.

---

## 2. Core Features

Based on the implemented modules, ViSakha offers the following key functionalities:

- **Interactive Dashboard:** Visualizes system performance, feedback metrics, and allows for data exports (using `html2canvas` and `jsPDF`).
- **Feedback & Conversation Management:** 
  - Allows administrators to review AI-User conversations.
  - Track and filter feedback (Thumbs Up/Thumbs Down/Not Matched).
  - Ability to mark conversations as "Resolved".
  - Export capabilities for raw conversation logs into Markdown or CSV formats.
- **Knowledge Curation System:** 
  - **Golden Knowledge (Golden DB):** A curated database of verified Q&A pairs.
  - **RAG Synchronization (RAG DB):** Automates the synchronization and indexing of Golden Knowledge for Retrieval-Augmented Generation (RAG) search capabilities.
  - Tracks "Possible Questions" based on queries where the bot failed to find a match.
- **Automated Reporting:** Utilizes `node-cron` and `nodemailer` to generate and dispatch daily performance digests to designated team members.
- **Role-Based Access Control (RBAC):** Manages permissions across different tiers (Super Admin, Moderator, Team Member) with secure JWT and Firebase authentication.

---

## 3. Technology Stack and Architecture

The project follows a decoupled monolithic architecture where the frontend and backend are developed in separate directories but can be built and served cohesively in production.

### Frontend (`/web`)
- **Framework:** React 19 built with Vite.
- **Language:** TypeScript.
- **Styling:** Tailwind CSS (v4) for responsive and modern UI components.
- **Data Visualization:** Recharts for rendering analytical graphs on the dashboard.
- **Authentication:** Firebase Auth combined with JWT decoding.
- **Routing:** React Router v7.

### Backend (`/api`)
- **Framework:** Express.js (v5).
- **Language:** TypeScript (executed via `tsx` during development).
- **Database:** MongoDB (using the native `mongodb` driver).
- **AI Integration:** `@google/generative-ai` for processing generative tasks.
- **Background Jobs & Mail:** `node-cron` for scheduling tasks and `nodemailer` for email communications.
- **Authentication:** Custom JWT-based authentication and Google Auth Library.

---

## 4. Development Aspect

### Workspace Structure
- `api/`: Contains all backend server logic, routes, database connections, and background services.
- `web/`: Contains the Vite + React frontend application.
- Root directory contains shared deployment configurations like Dockerfiles and Compose files.

### Running Locally
To set up the development environment, both the frontend and backend need to be started:

1. **Environment Variables:** Ensure `.env` files are properly configured in both `api/` and `web/` directories containing database URIs, API keys, and JWT secrets.
2. **Backend Development Server:**
   ```bash
   cd api
   npm install
   npm run dev
   ```
   *This uses `tsx` to run the TypeScript Express server with hot-reloading.*

3. **Frontend Development Server:**
   ```bash
   cd web
   npm install
   npm run dev
   ```
   *This starts the Vite development server.*

---

## 5. Deployment Aspect

ViSakha utilizes Docker for consistent, reliable, and scalable deployments.

### Docker Strategy
The project uses a **Multi-Stage Dockerfile** located at the root of the project to optimize the production image size and streamline the build process.

- **Stage 1 (web-build):** Uses a Node.js Alpine image to install frontend dependencies and run `npm run build` via Vite, generating static assets in `web/dist`.
- **Stage 2 (Production Server):** Uses a fresh Node.js Alpine image to install only backend dependencies. It then copies the backend source code and the compiled frontend assets (`web/dist`). The Express API is configured to serve these static frontend files in production alongside handling API requests on port `3000`.

### Orchestration with Docker Compose
Two Docker Compose files govern the environment setups:

1. **`docker-compose.yml` (Build from Source):**
   Used for building the image locally directly from the source code. It mounts the local environment variables and maps ports `80` and `3000` to the container's port `3000`.
   ```yaml
   services:
     app:
       build:
         context: .
       ports:
         - "80:3000"
         - "3000:3000"
       env_file:
         - ./api/.env
       restart: always
   ```

2. **`docker-compose.prod.yml` (Production Deployment):**
   Used for deploying directly to a production server without needing to build the source code. It pulls a pre-compiled image from a container registry (e.g., `nitinuser2003/alchemist_visakha:latest-v1.3`).
   ```yaml
   services:
     app:
       image: nitinuser2003/alchemist_visakha:latest-v1.3
       ports:
         - "80:3000"
         - "3000:3000"
       env_file:
         - .env
       restart: always
   ```

### Deployment Flow
1. Code changes are pushed and tested.
2. The Docker image is built using the multi-stage Dockerfile and tagged appropriately.
3. The image is pushed to the Docker registry (`nitinuser2003/alchemist_visakha`).
4. On the production server, `docker-compose -f docker-compose.prod.yml pull` and `up -d` are executed to seamlessly transition to the new version with automatic restarts enabled on failure (`restart: always`).
