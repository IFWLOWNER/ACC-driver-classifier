SERVER LIVE - setup (about 10 minutes, once)

1. Backend: paste the new rtgate.js into the rtGate service (Edit source) and deploy, as usual.
2. Website: upload the files in this package (licence-staff.html and the three files under assets/).
3. Open the Licence Centre as Owner -> Staff -> Events & Raceday -> Server Live -> "Feed setup (Owner only)" -> Show. Copy the key.
4. In GitHub: Settings -> Secrets and variables -> Actions -> New secret
     IFWL_INGEST_KEY = the key you just copied
     SERVER_LOG_PATH = the full path of the server.log on the GPortal PRO console server FTP (the only thing that differs from your existing flow)
   Your existing FTP host / user / password secrets are used as they are. If they have different names, change the names in the workflow file.
5. In the repo add:
     .github/workflows/server-live-feed.yml   (from server-live-feed.yml here)
     server-live/serverlog-poller.js
     server-live/ifwl-serverlog.js
   (keep the repo's public folders free of the raw log: this feed never writes it anywhere)
6. On race night: GitHub -> Actions -> "Server Live feed" -> Run workflow. The status pill on the Server Live page turns green ("Live, updated just now") within about 15 seconds.

Notes
- The feed reads the log over plain FTP (the usual GPortal setup). If your existing flow uses a different method, tell me and I will match it.
- Pop-ups and the optional sound only work while the Server Live page is open in a tab.
- No log yet? The page says so and you can still drag in a downloaded server.log with "Open a log file" to see the same view after the event.
- If the key ever leaks: Feed setup -> "Make a new key", then update the GitHub secret.
