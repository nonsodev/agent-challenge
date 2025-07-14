
# 📋 Project Manager Agent – Proactive AI for Trello, Jira & Markdown Planning

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Nosana](https://img.shields.io/badge/runs%20on-nosana-orange)

![Agent Banner](./assets/NosanaBuildersChallengeAgents.jpg)


> 🧠 Built with [Mastra](https://mastra.ai), the Project Manager Agent transforms raw ideas and chaotic boards into structured, actionable plans — intelligently and interactively and can connect to popular existing platforms like Trello or Jira to both intelligently read and write from them to help you organize structure and effectively plan both a team related or personal project or task.


## 🧠 What Makes It Unique?

Unlike traditional planning tools that wait for input, the **Project Manager Agent** takes initiative. It reads from Trello or Jira boards, identifies bottlenecks, gaps, and missing structure — then helps you *fix it*. Whether you’re building an app, launching a product, or planning a content strategy, it turns confusion into clarity using intelligent project decomposition and proactive assistance.

> **Main value proposition:** It eliminates planning paralysis by automating the breakdown, prioritization, and formatting of projects across Trello, Jira, or Markdown — helping you go from idea to execution *fast*.

---

## ✨ Key Features

- 🧠 **Goal Clarification** – Asks smart questions to understand your vision.
- 📖 **Board Reading** – Scans Trello/Jira boards for messy, incomplete, or unstructured info.
- 🧩 **Project Breakdown** – Convert project ideas into Epics → Stories → Tasks → Subtasks.
- 🎯 **Structured Outputs** – Each item includes:
  - Description
  - Acceptance Criteria
  - Effort Estimate
  - Priority
  - Dependencies
  - Assignee (Jira only)
- 🗂️ **Trello to Trello Cleanup** – Reads disorganized boards, writes structured plans into a new one.
- 🛠 **Jira Sprint Planner** – Builds sprint-ready tasks in Scrum format, linked by epics and stories.
- 🛠 **Trello Enhancer workflow** – Takes an optional existing trello board along with descriptions or more tasks, enhances them and outputs to a new trello board
- 🛠 **Jira Enhancer workflow** – Takes an optional existing jira project along with descriptions or more tasks, enhances them and outputs to a new jira project.
- 📄 **Markdown Export** – Outputs a clean plan when no board is connected.

---

## 🔧 Tool Integration

| Tool              | Purpose                                                                 |
|-------------------|-------------------------------------------------------------------------|
| **Jira Tool**     | Writes sprint-ready tasks. Requires project key & user credentials.     |
| **Trello Tool**   | Reads/Writes boards, useful for solo or early-stage planning.           |
| **Document Tool** | Generates Markdown plans when no tools are connected.                   |
| **DateTime Tool** | Dynamically adds realistic timelines and due dates.                     |

---

## Workflow Integration
| Workflow Name               | Purpose                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Jira Task Enhancement**   | Transforms unstructured tasks into well-defined Epics, Stories, and Subtasks for Jira.                |
| **Trello Task Enhancement** | Converts messy task lists into structured Trello boards with lists, cards, checklists, and due dates. |
| **Document Task Planner**   | Outputs a Markdown-based project plan when Jira/Trello is not available or not preferred.             |
| **Trello Cleanup Workflow** | Reads an existing Trello board, categorizes cards, and recommends priorities and dependencies.        |


## 💡 Use Cases

### ✅ Trello Cleanup & Categorization
> “I have a messy Trello board for my startup. I just dumped a bunch of random tasks in one column. Can you review it, clean it up into proper categories and checklists, put deadlines for the tasks (7 months from now), and suggest what I should work on first?”

🧠 Output: Organized epics, categorized tasks, realistic timelines, and priorities — written into a **new board** under the same workspace (`Demo output`).

---

### ✅ Jira Sprint Planning
> “We want to launch a resume builder app. I just created a Jira project with key `RESUME`. Can you break this into epics, stories and tasks for our first sprint?”

🎯 Output: Scrum-ready plan inside Jira with:
- Epics like “Template Engine”, “User Management”
- Story-pointed tasks
- Linked subtasks with dependencies
- Completion target in 1 month

---

### ✅ Exporting with File (No Board)
> “I want to start a content strategy for my personal brand. The goal is to create a 4-week content calendar, batch content weekly, and grow on LinkedIn + Instagram.”

📄 Output: A clean, exportable Markdown project plan with:
- Weekly milestones
- Task-level batching
- Growth metrics
- Clear sequencing & ownership (if provided)

---

## 🛠️ Environment Variables

`.env.example` includes:

| Key | Purpose |
|-----|---------|
| `API_BASE_URL` | LLM endpoint (e.g., Ollama, Nosana cloud) |
| `MODEL_NAME_AT_ENDPOINT` | E.g., `qwen2.5:1.5b`, `gemma3:12b` |
| `JIRA_EMAIL` | Used for Jira API authentication |
| `JIRA_API_TOKEN` | Jira token from Atlassian |
| `JIRA_BASE_URL` | Your Jira domain |
| `TRELLO_API_KEY` | Public identifier for Trello app |
| `TRELLO_TOKEN` | Grants board access for Trello |
| `DATABASE_URL` | Used for Mastra memory persistence (LibSQL) |

---

## 🚀 Getting Started

## 💻 Run It Locally
```bash
git clone https://github.com/nonsodev/agent-challenge
```
### 🔧 Prerequisites

- Node.js v18+
- [pnpm](https://pnpm.io/installation)
- [Ollama](https://ollama.com/) (optional for local LLM)

### 🚀 Start Development Server

```bash
pnpm install
pnpm run dev
```
---
Visit http://localhost:8080 in your browser.
---
## ⚙️ Environment Setup
```bash
cp .env.example .env
```
### For Ollama 
API_BASE_URL=http://localhost:11434/api (this is for local, check .env.example to Nosana or cloud deployments with GPU support)
MODEL_NAME_AT_ENDPOINT=qwen2.5:1.5b

Make sure Ollama is running in the background.
if you cannot run the model on your local device and want to test it out without paying, you could use the free tiers of either groq or gemini and adjust the config.ts file to support it.

---
## 🐳 Docker Support
### Build Image
```bash
docker build -t username/agent-challenge:dev .
docker login
```
### Run Container
```bash
docker run -p 8080:8080 --env-file .env username/agent-challenge:dev
```
### Push to Docker Hub (Optional)
```bash
docker tag agent-challenge username/agent-challenge:dev
docker push username/agent-challenge:dev
```


---

## 📌 Jira Setup Guide

> 🔒 The agent **does not** create Jira projects for you.

How to prepare:

1. Go to Jira
2. Click “Create project”
3. Choose **Scrum** → **Team-managed**
4. Set a name and project key (e.g., `RESUME`)
5. Paste the **project key** when prompted by the agent

---

## 🙌 Acknowledgements

* **Mastra Framework** – modular AI agents done right
* **Nosana Challenge** – decentralized agent deployment
* **Open Source Contributors** – keeping the build clean and extensible

---

## 📦 Submission & Links
---

**🌐 Deployment Page:**
[https://dashboard.nosana.com/jobs/Cvrmp58ucrPbtBbKxL3F19fHTLwPudzffPh7dW9TupHN](https://dashboard.nosana.com/jobs/Cvrmp58ucrPbtBbKxL3F19fHTLwPudzffPh7dW9TupHN)

**🐳 Docker Image:**
[https://hub.docker.com/r/nonsodev/agent-challenge](https://hub.docker.com/r/nonsodev/agent-challenge)

**📹 Demo Video:**
[https://youtu.be/zpMDZG3YLwE](https://youtu.be/zpMDZG3YLwE)

**💻 GitHub:**
[https://github.com/nonsodev/agent-challenge](https://github.com/nonsodev/agent-challenge)

**🐤 Twitter/X:**
[https://x.com/nonsodev](https://x.com/nonsodev)

**Nosana Deployment:**
[https://3tkmkvsmjzuovf6hbms5kbxekybdfpx8txuzpgzyebjm.node.k8s.prd.nos.ci/agents/projectManagerAgent/chat/eb06371e-48cf-438a-bb0e-7abd311b96c6](https://3tkmkvsmjzuovf6hbms5kbxekybdfpx8txuzpgzyebjm.node.k8s.prd.nos.ci/agents/projectManagerAgent/chat/eb06371e-48cf-438a-bb0e-7abd311b96c6)

**Solana Address:**
Cvrmp58ucrPbtBbKxL3F19fHTLwPudzffPh7dW9TupHN

**Host Address:**
6UG9Er6fVjcCjJYcsNnX1syi2PZD5PDeVkjBuDcbHb6V

**Deployer Address:**
8vR7motUTwKHC6Dsd1zv3cPjjQh6BwiHcJCXUzv6T13d

---

```
