# Staff web dashboard

Build this after the API in /server is working (step 8 of the roadmap).

Suggested approach: a simple React app (Vite) calling the /api/tickets
endpoints, plus a socket.io-client connection to receive live "ticket:updated"
events so the receptionist dashboard from the wireframe updates without
a page refresh.

Quick start once you're ready for this step:
  npm create vite@latest . -- --template react
  npm install socket.io-client
