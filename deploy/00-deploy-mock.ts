import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { developmentChains } from "../helper-hardhat-config";
import { ethers } from "hardhat";

const BASE_FEE = ethers.utils.parseEther("0.25"); // 0.25 is the premium; it costs 0.25 LINK per request
const GAS_PRICE_LINK = 1e9; 

const deployMocks: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments, network } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.name;
    const args = [BASE_FEE, GAS_PRICE_LINK];

    if (developmentChains.includes(chainId)) {
        log("Local network detected! Deploying mocks...");
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args,
        });

        log("Mocks Deployed!");
        log("----------------------------------------------------");
    }
};

export default deployMocks;
deployMocks.tags = ["all", "mocks"];
