## MODIFIED Requirements

### Requirement: Explicit embedded workspace selection
The panel and workspace dependency tool SHALL accept an explicit workspace path. Repository-development entry points SHALL explicitly select `<current checkout>/.xrbuild/`, with the explicit path taking precedence over `XRB_HOME` and the default user workspace. The repository SHALL provide a tool-installed **XR Build Dev** Start-menu entry that invokes the stable checkout's explicit repository launcher without replacing or changing the ordinary **XR Build** user-workspace shortcut.

#### Scenario: Develop from the primary checkout
- **WHEN** the maintainer starts the repository-development panel from the primary checkout
- **THEN** the panel reports the primary checkout's `.xrbuild/` as its workspace

#### Scenario: Develop from a task worktree
- **WHEN** the maintainer starts the repository-development panel from a task worktree
- **THEN** the panel reports that task worktree's `.xrbuild/`, not the primary checkout's folder or a permanent `XRB_HOME`

#### Scenario: Install the development shortcut
- **WHEN** the maintainer runs the development Start-menu installer from a stable checkout
- **THEN** Windows receives a distinct **XR Build Dev** shortcut that launches that checkout's `start-repo.vbs`, while **XR Build** continues to use the ordinary user workspace
