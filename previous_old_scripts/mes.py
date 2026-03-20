def equal_shares(voters, projects, cost, u, total_budget, tie_breaker_scores=None):
    """
    Computes the Method of Equal Shares for Participatory Budgeting.

    Args:
        voters (list): A list of voter names.
        projects (list): A list of project IDs.
        cost (dict): A dictionary mapping project IDs to their respective costs.
        u (dict): A dictionary mapping voter names to a dictionary mapping project IDs to the voter's score for the project.
        total_budget (int): The total budget available.
        tie_breaker_scores (dict): Optional dict mapping project IDs to their aggregated mean scores for breaking ties.

    Returns:
        list: A list of project IDs that are selected by the Method of Equal Shares.
    """
    approvers = {c: [i for i in voters if u[i][c] > 0] for c in projects}
    total_utility = {c: sum(u[i][c] for i in voters) for c in projects}
    mes = equal_shares_fixed_budget(voters, projects, cost, u, total_utility, approvers, total_budget, tie_breaker_scores)
    
    # add1 completion
    # start with integral per-voter budget
    budget = int(total_budget / len(voters)) * len(voters)
    current_cost = sum(cost[c] for c in mes)
    while True:
        # is current outcome exhaustive?
        is_exhaustive = True
        for extra in projects:
            if extra not in mes and current_cost + cost[extra] <= total_budget:
                is_exhaustive = False
                break
        # if so, stop
        if is_exhaustive:
            break
        # would the next highest budget work?
        next_budget = budget + len(voters)
        next_mes = equal_shares_fixed_budget(voters, projects, cost, u, total_utility, approvers, next_budget, tie_breaker_scores)
        next_cost = sum(cost[c] for c in next_mes)
        
        if next_cost <= total_budget:
            # yes, so continue with that budget
            budget = next_budget
            mes = next_mes
            current_cost = next_cost
        else:
            # we went over! Compare which one is closer to the target budget.
            diff_under = abs(total_budget - current_cost)
            diff_over = abs(next_cost - total_budget)
            if diff_over < diff_under:
                return next_mes
            else:
                break
    return mes

def break_ties(voters, projects, cost, total_utility, choices, tie_breaker_scores=None):
    """Return (single_winner_list, tiebreak_level) where level is how deep the tiebreak went."""
    remaining = choices.copy()
    level = "pure"  # no tiebreak needed if len(choices)==1

    best_cost = min(cost[c] for c in remaining)
    remaining = [c for c in remaining if cost[c] == best_cost]

    if len(remaining) > 1:
        level = "tb-utility"
        best_count = max(total_utility[c] for c in remaining)
        remaining = [c for c in remaining if total_utility[c] == best_count]

    if len(remaining) > 1 and tie_breaker_scores:
        level = "tb-score"
        best_tb_score = max(tie_breaker_scores[c] for c in remaining)
        remaining = [c for c in remaining if tie_breaker_scores[c] == best_tb_score]

    if len(remaining) > 1:
        level = "tb-alpha"
        remaining.sort()

    return remaining, level

def equal_shares_fixed_budget(voters, projects, cost, u, total_utility, approvers, total_budget, tie_breaker_scores=None):
    budget = {i: total_budget / len(voters) for i in voters}
    remaining = {} # remaining candidate -> previous effective vote count
    for c in projects:
        if cost[c] > 0 and len(approvers[c]) > 0:
            remaining[c] = total_utility[c]
    winners = []
    while True:
        best = []
        best_eff_vote_count = 0
        # go through remaining candidates in order of decreasing previous effective vote count
        remaining_sorted = sorted(remaining, key=lambda c: remaining[c], reverse=True)
        for c in remaining_sorted:
            previous_eff_vote_count = remaining[c]
            if previous_eff_vote_count < best_eff_vote_count:
                # c cannot be better than the best so far
                break
            money_behind_now = sum(budget[i] for i in approvers[c])
            if money_behind_now < cost[c]:
                # c is not affordable
                del remaining[c]
                continue
            # calculate the effective vote count of c
            approvers[c].sort(key=lambda i: budget[i] / u[i][c])
            paid_so_far = 0
            denominator = total_utility[c]
            for i in approvers[c]:
                # compute payment if remaining approvers pay proportional to their utility
                payment_factor = (cost[c] - paid_so_far) / denominator
                eff_vote_count = cost[c] / payment_factor
                if payment_factor * u[i][c] > budget[i]:
                    # i cannot afford the payment, so pays entire remaining budget
                    paid_so_far += budget[i]
                    denominator -= u[i][c]
                else:
                    # i (and all later approvers) can afford the payment; stop here
                    remaining[c] = eff_vote_count
                    if eff_vote_count > best_eff_vote_count:
                        best_eff_vote_count = eff_vote_count
                        best = [c]
                    elif eff_vote_count == best_eff_vote_count:
                        best.append(c)
                    break
        if not best:
            # no remaining candidates are affordable
            break
        best, _level = break_ties(voters, projects, cost, total_utility, best, tie_breaker_scores)
        best = best[0]
        winners.append(best)
        del remaining[best]
        # charge the approvers of best
        payment_factor = cost[best] / best_eff_vote_count
        for i in approvers[best]:
            payment = payment_factor * u[i][best]
            if budget[i] > payment:
                budget[i] -= payment
            else:
                budget[i] = 0
    return winners


def equal_shares_with_receipt(voters, projects, cost, u, total_budget, tie_breaker_scores=None):
    """
    Like equal_shares(), but also returns a receipt dict, a tiebreak_log dict, a rho_log, and an event_log:
      receipt[voter][project] = amount paid by that voter toward that project
      tiebreak_log[project]   = "pure" | "tb-utility" | "tb-score" | "tb-alpha" | "topup"
      rho_log[project]        = the final rho value (payment per utility unit)
      event_log               = list of project_ids in order of consideration (picked or rejected)
      event_metadata          = dict mapping project_id to algorithmic details (cost, budget gap, rho, etc.)
    """
    approvers = {c: [i for i in voters if u[i][c] > 0] for c in projects}
    total_utility = {c: sum(u[i][c] for i in voters) for c in projects}
    winners, receipt, tiebreak_log, rho_log, event_log, event_metadata = equal_shares_fixed_budget_with_receipt(
        voters, projects, cost, u, total_utility, approvers, total_budget, tie_breaker_scores
    )

    # add1 completion (same as equal_shares)
    budget_step = int(total_budget / len(voters)) * len(voters)
    final_budget = budget_step
    current_cost = sum(cost[c] for c in winners)
    while True:
        is_exhaustive = True
        for extra in projects:
            if extra not in winners and current_cost + cost[extra] <= total_budget:
                is_exhaustive = False
                break
        if is_exhaustive:
            break
        next_budget = budget_step + len(voters)
        next_winners, next_receipt, next_tb_log, next_rho_log, next_event_log, next_event_metadata = equal_shares_fixed_budget_with_receipt(
            voters, projects, cost, u, total_utility, approvers, next_budget, tie_breaker_scores
        )
        next_cost = sum(cost[c] for c in next_winners)
        if next_cost <= total_budget:
            budget_step = next_budget
            final_budget = next_budget
            winners = next_winners
            current_cost = next_cost
            receipt = next_receipt
            tiebreak_log = next_tb_log
            rho_log = next_rho_log
            event_log = next_event_log
            event_metadata = next_event_metadata
        else:
            # We went over! Compare absolute differences
            diff_under = abs(total_budget - current_cost)
            diff_over = abs(next_cost - total_budget)
            if diff_over < diff_under:
                # The "over" version is actually closer.
                return next_winners, next_receipt, next_tb_log, next_rho_log, next_event_log, next_event_metadata, next_budget
            else:
                break
    return winners, receipt, tiebreak_log, rho_log, event_log, event_metadata, final_budget


def equal_shares_fixed_budget_with_receipt(voters, projects, cost, u, total_utility, approvers,
                                            total_budget, tie_breaker_scores=None):
    """Receipt-logging version of equal_shares_fixed_budget. Also returns tiebreak_log, rho_log, and event_log."""
    budget = {i: total_budget / len(voters) for i in voters}
    # receipt[voter][project] = amount paid
    receipt = {i: {} for i in voters}
    tiebreak_log = {}   # project -> tiebreak level used to select it
    rho_log = {}        # project -> rho (price per unit of utility)
    event_log = []      # list of project_ids in order of consideration (picked or rejected)
    event_metadata = {} # details about consideration events
    remaining = {}
    for c in projects:
        if cost[c] > 0 and len(approvers[c]) > 0:
            remaining[c] = total_utility[c]
    winners = []
    while True:
        best = []
        best_eff_vote_count = 0
        remaining_sorted = sorted(remaining, key=lambda c: remaining[c], reverse=True)
        iteration_rejections = []
        for c in remaining_sorted:
            previous_eff_vote_count = remaining[c]
            if previous_eff_vote_count < best_eff_vote_count:
                break
            money_behind_now = sum(budget[i] for i in approvers[c])
            if money_behind_now < cost[c]:
                rho_log[c] = "unaffordable"
                iteration_rejections.append(c)
                event_metadata[c] = {
                    "status": "unaffordable",
                    "money_behind": money_behind_now,
                    "cost": cost[c],
                    "support_cnt": len(approvers[c])
                }
                del remaining[c]
                continue
            approvers[c].sort(key=lambda i: budget[i] / u[i][c])
            paid_so_far = 0
            denominator = total_utility[c]
            for i in approvers[c]:
                payment_factor = (cost[c] - paid_so_far) / denominator
                eff_vote_count = cost[c] / payment_factor
                if payment_factor * u[i][c] > budget[i]:
                    paid_so_far += budget[i]
                    denominator -= u[i][c]
                else:
                    remaining[c] = eff_vote_count
                    if eff_vote_count > best_eff_vote_count:
                        best_eff_vote_count = eff_vote_count
                        best = [c]
                    elif eff_vote_count == best_eff_vote_count:
                        best.append(c)
                    break
        if not best:
            break
        # track whether a tiebreak was needed
        needed_tiebreak = len(best) > 1
        best, tb_level = break_ties(voters, projects, cost, total_utility, best, tie_breaker_scores)
        winner = best[0]
        
        # Log rho for the winner
        payment_factor = cost[winner] / best_eff_vote_count
        rho_log[winner] = payment_factor
        
        tiebreak_log[winner] = tb_level if needed_tiebreak else "pure"
        winners.append(winner)
        del remaining[winner]
        # charge approvers and log payments
        for i in approvers[winner]:
            payment = payment_factor * u[i][winner]
            actual_payment = min(payment, budget[i])
            receipt[i][winner] = actual_payment
            budget[i] = max(0, budget[i] - payment)
        
        event_log.append(winner)
        event_metadata[winner] = {
            "status": "funded",
            "rho": payment_factor,
            "cost": cost[winner],
            "support_cnt": len(approvers[winner])
        }
        event_log.extend(iteration_rejections)

    # Add any final rejections if the loop broke without a winner
    final_rejections = sorted(remaining.keys(), key=lambda c: remaining[c], reverse=True)
    for c in final_rejections:
        if c not in event_log:
            money_behind_now = sum(budget[i] for i in approvers[c])
            rho_log[c] = "unaffordable"
            event_metadata[c] = {
                "status": "unaffordable",
                "money_behind": money_behind_now,
                "cost": cost[c],
                "support_cnt": len(approvers[c])
            }
            event_log.append(c)

    return winners, receipt, tiebreak_log, rho_log, event_log, event_metadata