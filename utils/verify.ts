import { run } from "hardhat";

const verify = async (contractAddress: string, args: any[]) => {
    console.log("Verifying contract...");
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        });
    } catch (err: any) {
        err.message.toLowerCase().includes("already verfied")
            ? console.log("Already verfied")
            : console.log(err);
    }
};

export default verify;
