SERVER LIVE - all seven servers (finished with your real secret names)

Upload
1. rtgate.js -> paste into the rtGate service (Edit source) and deploy (only needed if you did not already deploy the version with the server boxes).
2. Website: licence-staff.html, assets/js/12-server-live.js, assets/js/ifwl-serverlog.js, assets/css/06-server-live.css
3. GitHub repo, folder server-live: replace serverlog-poller.js and ifwl-serverlog.js, add servers.json
4. GitHub repo: replace .github/workflows/server-live-feed.yml with server-live/server-live-feed.yml from this package.
   (The file is also in this zip at .github/workflows/server-live-feed.yml - same file.)
   Secret still needed: IFWL_INGEST_KEY (Owner copies it from Server Live > Feed setup).

Which secrets feed which box (change a line in the workflow if one is the wrong way round)
  Console Beginner   GPORTAL_CONSOLE_BEGINNER_*
  Console Pro        GPORTAL_CONSOLE_PROAM_*       (best guess - the page shows each server's own name from its log, so check it says PRO)
  Console Am         GPORTAL_CONSOLE_AM_*
  Console Mon Funday GPORTAL_MONDAY_FUNDAY_*
  PC Monday Multi    ASSETTO_PC_MONDAY_FUNDAY_*
  PC Pro Am          ASSETTO_PC_PROAM_*
  PC Beginner        ASSETTO_PC_BEGINNER_*
Not used: GPORTAL_CONSOLE_LICENCE, ASSETTO_PC_LICENCE, ASSETTO_PC_PRO, ASSETTO_CONSOLE_RACETEAM.

How it finds the log: the *_RESULTS_PATH secret can be the results folder. The feed looks for server.log in that folder, in a log/logs
folder inside it, and next to it, and says in the GitHub run log which file it picked. If your secret is the full path to a .log file it uses that.
