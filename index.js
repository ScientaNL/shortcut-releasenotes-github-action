const github = require('@actions/github');
const core = require('@actions/core');

const octokit = github.getOctokit(core.getInput('github-token'));

async function run() {
    core.info(
        JSON.stringify(github.context.payload)
    );
}

run().catch((error) => core.setFailed(error.message));
