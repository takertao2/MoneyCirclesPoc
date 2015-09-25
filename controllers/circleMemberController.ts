﻿import express = require("express");
import circleModel = require('../models/circleModel');
import userModel = require('../models/userModel');
import depositModel = require('../models/depositModel');
import loanModel = require('../models/loanModel');
import bitReserveService = require('../services/bitReserveService');
import web3plus = require('../node_modules/web3plus/lib/web3plus');
import _ = require('underscore');

/**
 * Controller for Circle membership operations.
 */
export class CircleMemberController {
    private config: IApplicationConfig;
    /**
     * The simple-oauth2 module, which has no typings.
     */
    private oauth2;

    private authorization_uri: string;

    constructor(configParam: IApplicationConfig) {
        this.config = configParam;
    }

    getAll = (req: express.Request, res: express.Response) => {
        var token = req.header("AccessToken");

        circleModel.Circle.find({}, (err, circleRes) => {
            res.send(circleRes);
        });
    }

    getOne = (req: express.Request, res: express.Response) => {
        var token = req.header("AccessToken");

        circleModel.Circle.findOne({ _id: req.params.id }, (err, circleRes) => {
            res.send(circleRes);
        });
    }

    join = (req: express.Request, res: express.Response) => {
        var token = req.header("AccessToken");

        // Load the full circle data
        var circleData = <circleModel.ICircle>req.body;
        circleModel.Circle.findOne({ _id: circleData._id }).exec()
            .then((circle) => {

                userModel.getUserByAccessToken(token, function (userErr, userRes) {
                    if (userErr) {
                        res.status(500).json({
                            "error": userErr,
                            "error_location": "getting user data",
                            "status": "Error",
                        });
                    } else {
                        // Add the user to this circle
                        var user = <userModel.IUser>userRes;

                        // Check for existing membership
                        if (user.circleMemberships.some(
                            (value, index, arr) => {
                                return value.circleId === circleData._id.toString() && !value.endDate;
                            })) {
                            res.status(500).json({
                                "error": "User is already a member of this circle",
                                "error_location": "joining circle",
                                "status": "Error",
                            });
                        } else {
                            // 1. Add to the Contract
                            var circleContract = web3plus.loadContractFromFile('Circle.sol', 'Circle', circle.contractAddress, true, function (loadContractError, circleContract) {
                                if (loadContractError) {
                                    res.status(500).json({
                                        "error": loadContractError,
                                        "error_location": "loading circle contract",
                                    });
                                } else {
                                    // We need to call user._id.toString() to prevent it being passed as ObjectId,
                                    // which web3 doesn't know how to handle.
                                    circleContract.addMember(user._id.toString(), user.externalId, { gas: 2500000 })
                                        .then(web3plus.promiseCommital)
                                        .then(function (tx) {
                                            // 2. Register in MongoDB

                                            var cm = new userModel.CircleMembership();
                                            cm.circleId = circleData._id.toString();
                                            cm.startDate = new Date();
                                            user.circleMemberships.push(cm);

                                            user.save(function (saveErr, saveRes) {
                                                if (saveErr) {
                                                    res.status(500).json({
                                                        "error": saveErr,
                                                        "error_location": "saving user data",
                                                        "status": "Error",
                                                    });
                                                } else {
                                                    res.status(200).json(saveRes);
                                                }
                                            });
                                        })
                                        .catch(function (addMemberToContractError) {
                                            res.status(500).json({
                                                "error": addMemberToContractError,
                                                "error_location": "adding member to circle contract",
                                                "status": "Error",
                                            });

                                        });
                                }

                            });


                        }
                    }
                });
            },
                function (loadCircleError) {
                    res.status(500).json({
                        "error": loadCircleError,
                        "error_location": "saving user data",
                        "status": "Error",
                    });

                });
    }

    deposit = (req: express.Request, res: express.Response) => {
        var token = req.header("AccessToken");

        var circleId = req.params.id;

        var depositData = <depositModel.IDeposit>req.body;

        var adminAccount = this.config.bitReserve.circleVaultAccount.userName;

        var brs = new bitReserveService.BitReserveService(token);

        // Create the transaction
        brs.createTransaction(depositData.fromCard, depositData.amount, depositData.currency, adminAccount, (createErr, createRes) => {
            if (createErr) {
                res.status(500).json({
                    "error": createErr,
                    "error_location": "creating transaction"
                });
            }
            else {
                // Commit it
                brs.commitTransaction(createRes, (commitErr, commitRes) => {
                    if (commitErr) {
                        res.status(500).json({
                            "error": commitErr,
                            "error_location": "committing transaction"
                        });
                    } else {
                        // Store it in our transaction history.

                        // Note: this method is very fragile. Any transaction to the value store should be atomically stored
                        // on our side. This could be realized when the value store of a circle has an individual BitReserve
                        // identity. Storage of the transaction then doesn't have to be completed in this request, but could
                        // be done by an idempotent background process.
                        var dep = new depositModel.Deposit();

                        // Get our user info
                        userModel.getUserByAccessToken(token,
                            (userErr, userRes) => {
                                if (userErr) {
                                    res.status(500).json({
                                        "error": commitErr,
                                        "error_location": "getting user data to store transaction"
                                    });
                                }
                                else {
                                    dep.amount = commitRes.denomination.amount;
                                    dep.currency = depositData.currency;
                                    dep.dateTime = commitRes.createdAt;
                                    dep.fromCard = depositData.fromCard;
                                    dep.circleId = circleId;
                                    dep.transactionId = commitRes.id;
                                    dep.userId = userRes._id;
                                    dep.save();

                                    res.json(dep);
                                }
                            });
                    }
                });
            }
        });
    }

    loan = (req: express.Request, res: express.Response) => {
        var token = req.header("AccessToken");

        var circleId = req.params.id;

        var loanData = <loanModel.ILoan>req.body;

        var adminAccount = this.config.bitReserve.circleVaultAccount.userName;

        // Steps:
        // 1. Create BitReserve transaction from the global vault to the borrower
        // 2. Create Loan smart contract by calling the Circle contract
        // 3. Store in MongoDB
        // 4. Store BitReserve transaction ID with loan contract.
        // 5. Store BitReserve transaction ID in MongoDB.
        // 6. Confirm BitReserve transaction (or not if the Loan contract denies)

        // Rationale: the Circle Loan contract is the primary judge of whether the loan
        // is allowed (1). If it is, we want to store the new contract address ASAP (2).

        // The payout could principal/y be done by another service independent
        // of the app. It would idempotently scan all Loans that aren't payed
        // out, then carry out steps. However it would also need the ability
        // to update the loan amount as there can be a rounding difference.

        // TODO: check whether circle balance allows for this loan
        // TODO: various other checks to see if loan is approved (credit rating, admin approval, ...)

        // TODO: convert to promises or otherwise flatten this code. Can you say "callback hell"?

        // Get logged in user info
        userModel.getUserByAccessToken(token,
            (userErr, userRes) => {
                if (userErr) {
                    res.status(500).json({
                        "error": userErr,
                        "error_location": "getting user data to store loan"
                    });
                }
                else {
                    // Get global Circle Vault account
                    userModel.User.findOne({ externalId: adminAccount }).exec()
                        .then((adminUserRes) => {
                            // Create BitReserve connector for global admin user.
                            var brs = new bitReserveService.BitReserveService(adminUserRes.accessToken);

                            // Get card to transfer from. For now: take the first card with enough balance.
                            // TODO: create and configure 1 card per circle? That would help to
                            // check [Circle balance as reported by contract] <> [Circle balance in BitReserve].
                            brs.getCards((cardsErr, cardsRes) => {
                                if (cardsErr) {
                                    res.status(500).json({
                                        "error": cardsErr,
                                        "error_location": "getting cards"
                                    });
                                }
                                else {
                                    // We can't compare the amounts, as they're possibly in different currencies.
                                    // This will be smoother if balance for each Circle is stored in a separate card.
                                    var firstCardWithBalance = _(cardsRes).find((c) => {
                                        return c.normalized[0].available > loanData.amount;
                                    });

                                    if (firstCardWithBalance == null) {
                                        res.status(500).json({
                                            "error": "no card with enough balance",
                                            "error_location": "getting card for loan payment"
                                        });

                                    } else {

                                        // Create the transaction.
                                        brs.createTransaction(firstCardWithBalance.id, loanData.amount, loanData.currency, userRes.externalId, (createErr, createRes) => {
                                            if (createErr) {
                                                res.status(500).json({
                                                    "error": createErr,
                                                    "error_location": "creating transaction"
                                                });
                                            }
                                            else {
                                                circleModel.Circle.findOne({ _id: circleId }, function (loadCircleErr, circle) {
                                                    if (loadCircleErr) {
                                                        res.status(500).json({
                                                            "error": loadCircleErr,
                                                            "error_location": "loading Circle data"
                                                        });
                                                    } else {
                                                        var circleContract = web3plus.loadContractFromFile('Circle.sol', 'Circle', circle.contractAddress, true, function processCircleContract(circleContractErr, circleContract) {
                                                            var lastLoanIndex = circleContract.loanIndex().toNumber();

                                                            circleContract.createLoan(userRes._id.toString(), loanData.amount, { gas: 2500000 })
                                                                .then(web3plus.promiseCommital)
                                                                .then(function processLoanContract(tx) {
                                                                    // Loan contract was created.
                                                                    // At this point we only have the transaction info. We assume that the last loan
                                                                    // created is our lon.
                                                                    // TODO: Get the address of the newly created in a more robust way.
                                                                    // Possibly use Solidity events.
                                                                    var loanIndex = circleContract.loanIndex().toNumber();

                                                                    // We do check whether a single loan was created since our call.
                                                                    // Ways in which this could be incorrect:
                                                                    // 1. False success: Our call failed, but another call succeeded in the mean time.
                                                                    // 2. False failure: our call succeeded, but one or more other calls succeeded in
                                                                    // the mean time.
                                                                    if (loanIndex != lastLoanIndex + 1) {
                                                                        res.status(500).json({
                                                                            "error": "Loan contract can't be found.",
                                                                            "error_location": "creating loan contract"
                                                                        });
                                                                    }
                                                                    else {
                                                                        var newLoanAddress = circleContract.activeLoans(loanIndex);

                                                                        // Get loan sub contract
                                                                        var loanContractDefinition = circleContract.allContractTypes.Loan.contractDefinition;
                                                                        var loanContract = loanContractDefinition.at(newLoanAddress);

                                                                        // Store it in our loan storage.
                                                                        var loan = new loanModel.Loan();

                                                                        // Store the exact amount from the transaction. BitReserve
                                                                        // rounds amounts like 0.005 to 0.01.
                                                                        loan.amount = createRes.denomination.amount;
                                                                        loan.contractAddress = loanContract.address;
                                                                        loan.currency = loanData.currency;
                                                                        loan.purpose = loanData.purpose;
                                                                        loan.dateTime = new Date();
                                                                        loan.circleId = circleId;
                                                                        loan.userId = userRes._id;
                                                                        loan.save(function (loanSaveErr, loanSaveRes) {
                                                                            if (loanSaveErr) {
                                                                                res.status(500).json({
                                                                                    "error": loanSaveErr,
                                                                                    "error_location": "saving loan"
                                                                                });
                                                                            } else {
                                                                                // Commit the BitReserve transaction
                                                                                brs.commitTransaction(createRes, (commitErr, commitRes) => {
                                                                                    if (commitErr) {
                                                                                        res.status(500).json({
                                                                                            "error": commitErr,
                                                                                            "error_location": "committing transaction"
                                                                                        });
                                                                                    } else {
                                                                                        // Set the contract as paid
                                                                                        circleContract.setPaidOut(newLoanAddress, commitRes.id, { gas: 2500000 })
                                                                                            .then(web3plus.promiseCommital)
                                                                                            .then(function afterSetPaid(tx) {
                                                                                                // Store the tx ID in the loan db storage.
                                                                                                loan.transactionId = commitRes.id;
                                                                                                loan.save(function (loanTxSaveErr, loanTxSaveRes) {
                                                                                                    if (loanTxSaveErr) {
                                                                                                        res.status(500).json({
                                                                                                            "error": loanTxSaveErr,
                                                                                                            "error_location": "saving transaction ID to loan"
                                                                                                        });
                                                                                                    }
                                                                                                    else {
                                                                                                        // All done. Return database loan.
                                                                                                        res.json(loan);
                                                                                                    }
                                                                                                });
                                                                                            })
                                                                                            .catch(function (setPaidError) {
                                                                                                res.status(500).json({
                                                                                                    "error": setPaidError,
                                                                                                    "error_location": "setting loan contract as paid"
                                                                                                });

                                                                                            });
                                                                                    }
                                                                                });
                                                                            }
                                                                        });
                                                                    }
                                                                })
                                                                .catch(function (createLoanError) {
                                                                    res.status(500).json({
                                                                        "error": createLoanError,
                                                                        "error_location": "creating loan contract"
                                                                    });
                                                                });


                                                        });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                }
                            });
                        },
                            function (loadUserErr) {
                                res.status(500).json({
                                    "error": loadUserErr,
                                    "error_location": "loading circle vault"
                                });

                            });
                }
            });
    }
}
