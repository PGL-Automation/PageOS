"use strict";
const app = require("./app");
const { cleanupSessions } = require("./auth");
const PORT = process.env.PORT || 8080;
setInterval(() => { try { cleanupSessions(); } catch (e) {} }, 30 * 60 * 1000);
app.listen(PORT, () => console.log(`Page Group Appraisal server listening on :${PORT}`));
