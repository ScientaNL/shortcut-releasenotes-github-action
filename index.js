const github = require('@actions/github');
const core = require('@actions/core');

const octokit = github.getOctokit(core.getInput('github-token'));

async function run() {
    console.log(octokit)
}

run().catch((error) => core.setFailed(error.message));
