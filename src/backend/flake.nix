{
  description = "A very basic flake";
  inputs = {
    nixpkgs-mozilla.url = "github:mozilla/nixpkgs-mozilla";
  };

  outputs = {
    self,
    nixpkgs,
    nixpkgs-mozilla,
  }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages."${system}".extend nixpkgs-mozilla.overlays.rust;
  in {
    devShells."${system}" = rec {
      shell = pkgs.mkShell {
        packages = [pkgs.latest.rustChannels.stable.rust pkgs.openssl pkgs.pkg-config];
      };
      default = shell;
    };
  };
}
