{
  description = "Footer Dock: the pinned toolchain for developing it";

  # flake.lock pins the exact nixpkgs revision, so everyone gets the same Node, npm, Python and Git.
  # Update on purpose with `nix flake update`, then run scripts/gate.sh and commit flake.lock.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAll (pkgs: {
        # Node 24 runs the full check; this is the shell for everyday work.
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
            pkgs.git
            # Only the terminal-capture scripts under scripts/ need Python.
            (pkgs.python3.withPackages (python: [ python.pyte ]))
          ];
          shellHook = ''
            export npm_config_update_notifier=false
            export npm_config_fund=false
            [ -d node_modules ] || echo "First time here: run 'npm ci'."
          '';
        };
        # Node 22 is the oldest version Footer Dock supports; the tests must pass on it too.
        node22 = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.git
          ];
        };
      });
    };
}
