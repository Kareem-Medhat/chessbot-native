{
  description = "A very basic flake";

  outputs = {
    nixpkgs,
    ...
  }: let
    system = "x86_64-linux";
    pkgs = nixpkgs.legacyPackages."${system}";
  in {
    devShells."${system}" = rec {
      shell = pkgs.mkShell {
        packages = with pkgs; [gnumake];
      };
      default = shell;
    };
  };
}
