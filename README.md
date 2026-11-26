# SipStreak: HydroHero Hunt

A collaborative team hydration challenge web app, written in plain HTML, CSS and JavaScript (no build step, no libraries).

**Run it:** open `index.html` in a browser, or publish the folder with GitHub Pages (Settings > Pages > Deploy from branch > `main` / root).
Use **Log in as Priya (demo)** to try it at once. Data is saved in the browser (localStorage).

## Files (one file per language)
| File | Language | Contains |
| --- | --- | --- |
| `index.html` | HTML | Page shell: header, navigation, content area |
| `style.css` | CSS | Dark glass theme, layout, responsive rules |
| `script.js` | JavaScript | Scoring logic, storage and sample data, animated water bottle, pages, routing, forms, history chart |

## Features
- One-tap logging (+250 / +500 / +750 ml or custom), plus remove, set an exact total and clear today
- Daily goal = body weight x 35 ml (or a custom goal); caffeine rule adds 200 ml per coffee / energy drink
- Squads of up to 8 with 6-character invite codes
- Fair leaderboard: team score = average of every member's `min(1, intake / goal)` x 100
- Seven-day chart, streaks, sample squads and a demo account

## Demo story
Hostel Block B starts at 72%. One +500 ml tap by Priya lifts it to 78%, past Hostel Block A (75%).
