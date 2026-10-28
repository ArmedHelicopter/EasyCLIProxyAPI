# Development isolation

Build and test the GUI only from this migrated main worktree:

`E:\_ryanDev\EasyCLIProxyAPI`

The GUI must connect only to the isolated development kernel:

`E:\_ryanDev\_kernel_stage_8.0.43`

Do not connect the development GUI to the production installation at `D:\Program Files\EasyCLIProxyAPI-v0.3.43-Windows-amd64`.

For unattended runs, disable optional privileged discovery/model-fetch helpers and use isolated configuration. Build scripts must not copy artifacts to the production directory unless an explicitly approved release procedure is in progress.
