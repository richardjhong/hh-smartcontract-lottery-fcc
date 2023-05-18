import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} from "../helper-hardhat-config";
import { ethers } from "hardhat";
import verify from "../utils/verify";

const FUND_AMOUNT = 1e9;

const Raffle: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments, network } = hre;
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinatorV2Address: string | undefined;
    let subscriptionId: string | undefined;
    let vrfCoordinatorV2Mock: any;

    if (chainId == 31337) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
        const txResponse = await vrfCoordinatorV2Mock.createSubscription();
        const txReceipt = await txResponse.wait(1);
        subscriptionId = txReceipt.events[0].args.subId;
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT);
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId!]["vrfCoordinatorV2"];
        subscriptionId = networkConfig[chainId!]["subscriptionId"];
    }

    const waitConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS;

    const args: any[] = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId!]["gasLane"],
        networkConfig[chainId!]["keepersUpdateInterval"],
        networkConfig[chainId!]["raffleEntranceFee"],
        networkConfig[chainId!]["callbackGasLimit"],
    ];

    const raffle = await deploy("Raffle", {
        from: deployer,
        args,
        log: true,
        waitConfirmations,
    });

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...");
        await verify(raffle.address, args);
    } else {
        await vrfCoordinatorV2Mock!.addConsumer(subscriptionId, raffle.address);
    }
    log("----------------------------------------------------");
};

export default Raffle;
Raffle.tags = ["all", "raffle"];
