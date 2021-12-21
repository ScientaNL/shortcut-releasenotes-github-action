# Release Notes <%= head %>
_Release notes are created between releases `<%= head %>` and `<%= base %>`._
- 👉 [View  stories in Shortcut](<%= version.app_url %>)
- 👉 [View Github diff](https://github.com/<%= repositoryOwner %>/<%= repository %>/compare/<%= base %>...<%= head %>)

<%_ if(stories.filter(createStoryTypeFilter('feature')).length) { _%>
# 🚀 Features
<%_ stories.filter(createStoryTypeFilter('feature')).forEach((story) => {  _%>
- <%= story.name %> [[<%= story.id %>]](<%= story.app_url %>) <% story.labels.filter(labelVersionFilter).forEach((label) => { _%>`<%= label.name %>` <% }); %>
<%_ }); _%>

<%_ } _%>
<%_ if(stories.filter(createStoryTypeFilter('bug')).length) { _%>

# 🐛 Bugfixes
<%_ stories.filter(createStoryTypeFilter('bug')).forEach((story) => {  _%>
- <%= story.name %> [[<%= story.id %>]](<%= story.app_url %>) <% story.labels.filter(labelVersionFilter).forEach((label) => { _%>`<%= label.name %>` <% }); %>
<%_ }); _%>

<%_ } _%>
<%_ if(stories.filter(createStoryTypeFilter('chore')).length) { _%>
# 🧰 Maintenance
<%_ stories.filter(createStoryTypeFilter('chore')).forEach((story) => {  _%>
- <%= story.name %> [[<%= story.id %>]](<%= story.app_url %>) <% story.labels.filter(labelVersionFilter).forEach((label) => { _%>`<%= label.name %>` <% }); %>
<%_ }); _%>

<%_ } _%>
