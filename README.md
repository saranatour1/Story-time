<p align="center">
  <img src="public/favicon.svg" alt="Story-time logo" width="96" height="96">
</p>

<h1 align="center">Story-time</h1>

<p align="center"><b>Put a trip's photos together with the people you went with, then watch it back as a story.</b><br><a href="https://story-time.saranatour.dev">story-time.saranatour.dev</a></p>

- Make a trip and invite your friends with a link.
- Everyone adds their photos.
- The app puts them in order and plays them back with a map of where you went.
- Only people you invite can see it.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # set ENCRYPTION_MASTER_KEY (openssl rand -base64 32)
pnpm dev                         # then open http://localhost:3000
```

## Docs

- [User guide](docs/user-guide.md)
- [How it works, settings and deploying](docs/architecture.md)
- [Backend code](convex/README.md)
