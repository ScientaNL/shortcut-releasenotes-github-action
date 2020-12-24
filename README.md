# clubhouse-releasenotes-github-action
Scienta's take on release notes using Clubhouse:
- Decide which version is the predecessor of this release.
- Fetch stories from commit messages, pull requests and the comments on those PRs.
- Add a version label to all completed stories.
- Render all stories as release notes based on a given `ejs` template.

# Usage with Github Actions
Use this action on a release trigger.
In the body of a release you can add a release notes tag. This tag will be substituted with the generated release notes markdown.

## Example:
While creating a release in Github, add a tag to the release message body. Use name of the predecessor of this release. All issues between the current release and it's given predecessor will added to this release notes.
```md
[rn > 7.2.1]
```

# Development

## Run Docker Stack
```
docker-compose  up -d --force-recreate --remove-orphans
```

## install dependencies
```
docker exec -ti clubhouse-releasenotes-github-action yarn
```

## Run
Github Actions has the custom to use hyphens for inputs, even though inputs are transported to node using the environment.
At first I had the simulate-ga added as an yarn script, but both yarn and npm remove "invalid" values from the environment.

Use this bash script instead:
```
docker exec -ti clubhouse-releasenotes-github-action ./simulate-ga.sh
```

# Templating

## releasenotes-template
The following variables are available:

| Variable                 | Description                                                                          | Type                                                      |
|--------------------------|--------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `head`                   | Tag name of the release                                                              | `string`                                                  |
| `base`                   | Tag name of the version to base the release on                                       | `string`                                                  |
| `stories`                | Clubhouse stories                                                                    | `Story[]`                                                 |
| `labelVersionFilter`     | Filter a Label[] to return only *other* version labels. It's own version is omitted. | `(labels: Label[]) => Label[]`                            |
| `createStoryTypeFilter`  | Creates a callback which can be used in `stories.filter` to filter on a story type.  | `(storyType: string) => ((stories: Story[]) => Story[])`  |
| `repositoryOwner`        | Github repository owner                                                              | `string`                                                  |
| `repository`             | Github repository                                                                    | `string`                                                  |

## no-stories-template
The following variables are available:

| Variable                 | Description                                                                          | Type                                                      |
|--------------------------|--------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `head`                   | Tag name of the release                                                              | `string`                                                  |
| `base`                   | Tag name of the version to base the release on                                       | `string`                                                  |
| `repositoryOwner`        | Github repository owner                                                              | `string`                                                  |
| `repository`             | Github repository                                                                    | `string`                                                  |

# Github Action
## Inputs
| Input                    | Description                                                                     |
|--------------------------|---------------------------------------------------------------------------------|
| `github-token`           | Github Personal Access Token                                                    |
| `clubhouse-token`        | Clubhouse API token                                                             |
| `repository-owner`       | Repository owner where releases are made from                                   |
| `repository-name`        | Repository where releases are made from                                         |
| `releasenotes-template`  | ejs-driven markdown template to render the release notes                        |
| `no-stories-template`    | ejs-driven markdown template to render if there are no completed stories found  |
