/**
 * A loan taken out of a circle.
 */
contract Loan {
    /**
     * The amount that was loaned, in pence GBP.
     */
    uint public amount;

    /**
     * The MoneyCircles userId that took out the loan. The userId is
     * the ID as present in the MoneyCircles database.
     */
    string public userId;

    /**
     * The Circle that this loan was taken out from.
     */
    address public circle;

    /**
     * The BitReserve transaction ID where this loan was payed out.
     */
    string public payoutTransactionId;

    // How to check whether a string is null or empty? Using a == ""
    // is not allowed by the compiler (sees "" as bytes0)
    bool public isPaidOut;

    /**
     * The BitReserve transaction ID where this loan was payed repaid.
     */
    string public repaymentTransactionId;

    bool public isRepaid;

    /**
     * Confirm that the loan has been paid out by referring to the BitReserve
     * transaction in which it was paid.
     */
    function setPaidOut(string bitReserveTxId) {
        if(msg.sender != circle)
            return;

        // Don't allow updating the tx ID.
        // Weakness: as the contract has no window to the outside world, we
        // can't see whether this is a real transaction, has the right amount,
        // is sent to the right recipient etc. Hence the transaction ID has
        // to be correct on the first go.
        //
        // A possible way to improve this is to allow only a fixed of oracles
        // to set (or confirm) the repayment transaction ID after having
        // verified it in "the real world". Storing the tx id's could then be
        // a two-step process and the functionality would be more decentralized.
        if(isPaidOut)
            return;

        payoutTransactionId = bitReserveTxId;
        isPaidOut = true;
    }

    /**
     * Confirm that the loan has been repaid by referring to the BitReserve
     * transaction in which it was paid.
     */
    function setRepaid(string bitReserveTxId) {
        if(msg.sender != circle)
            return;

        // Only allow repayment after paying out.
        if(!isPaidOut)
            return;

        // Don't allow updating the tx ID.
        if(isRepaid)
            return;

        repaymentTransactionId = bitReserveTxId;
        isRepaid = true;
    }

    function Loan(string newUserid, uint newAmount) {
        userId = newUserid;
        amount = newAmount;
        // We store the sender of the message as the circle address.
        // This adds some form of security: if anyone else would create a
        // Loan, and the address would not be from a Circle contract, that
        // Loan is not considered valid.
        circle = msg.sender;
    }
}

/**
 * A single Money Circle. The entry contract for all properties.
 */
contract Circle {
    string public name;
    string public commonBond;
    address public creator;

    function Circle(string newName, string newCommonBond){
        name = newName;
        commonBond = newCommonBond;
        creator = msg.sender;
    }

    struct Member {
        string id;
        string username;
    }

    /**
     * The member list. Join date/time can be derived from the blockchain.
     */
    mapping(uint => Member) public members;
    uint public memberIndex;

    /**
     * Index of the members by sha3(id), for getting members by ID.
     * Not done as string => uint because not supported by Solidity.
     * This is probably very inefficient because of the sha3().
     */
    mapping(bytes32 => uint) public memberIndexByIdHash;

    mapping(uint => Loan) public activeLoans;
    uint public loanIndex;

    function addMember(string id, string userName) {
        if(msg.sender != creator)
            return;

        memberIndex++;

        Member m = members[memberIndex];
        m.id = id;
        m.username = userName;
        memberIndexByIdHash[sha3(id)] = memberIndex;
    }

    function createLoan(string memberId, uint amount) returns (Loan l) {
        if(msg.sender != creator)
            return;

        // Check if the user was a member.
        if(memberIndexByIdHash[sha3(memberId)] == 0)
            return;

        loanIndex++;

        l = new Loan(memberId, amount);
        activeLoans[loanIndex] = l;

        return l;
    }

    /**
     * Confirm that the loan has been paid out by referring to the BitReserve
     * transaction in which it was paid.
     */
   function setPaidOut(Loan l, string bitReserveTxId) {
        if(msg.sender != creator)
            return;

        // Check if this loan is ours. Note that the Loan does this too.
        // TODO

        l.setPaidOut(bitReserveTxId);
    }

    /**
     * Confirm that the loan has been repaid by referring to the BitReserve
     * transaction in which it was paid.
     */
    function setRepaid(Loan l, string bitReserveTxId) {
        if(msg.sender != creator)
            return;

        // Check if this loan is ours. Note that the Loan does this too.
        // TODO

        l.setRepaid(bitReserveTxId);
    }
}
