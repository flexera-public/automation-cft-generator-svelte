# Flexera Automation CloudFormation Template Generator

A single page app built with Svelte that generates a CloudFormation Template which can be used for onboarding Flexera Automation to AWS.  Created as a 2024 Hackathon Project by [@bryankaraffa](https://github.com/bryankaraffa).

## Developing

> Note: This repository includes a [devcontainer.json](.devcontainer/devcontainer.json) file that can be used to open the project in a [Visual Studio Code Remote - Containers](https://code.visualstudio.com/docs/remote/containers) development environment.  This is the recommended way to setup a development environment and work on this project.

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev -- --host

# or start the server and open the app in a new browser tab
npm run dev -- --host --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
