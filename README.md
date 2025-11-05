# Question Practice App

A simple React app letting users practice math questions with LaTeX support and progress saved to localStorage.

Features
- Select cluster and topic
- Get random questions (no repeats until all completed)
- Show hint, show answer & solution
- Save question for later and mark completed
- Progress persisted in localStorage
- Reset progress

Dependencies
- react, react-dom
- react-scripts (create-react-app compatible)
- react-katex and katex for LaTeX rendering

Install & run

```bash
# from project root
npm install
npm start
```

Notes
- Questions are in `src/data/questions.json` — add/remove questions there.
- Local progress stored under `qaProgress` in localStorage.

