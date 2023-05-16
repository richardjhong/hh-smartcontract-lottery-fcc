import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "dotenv/config";

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.8",
            },
        ],
    },
};

export default config;
