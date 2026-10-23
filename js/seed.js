/* First-run data.
   The public build ships EMPTY — start fresh, then either:
   · Settings → Import from Excel  (your Investment.xlsx in its original layout)
   · or add deposits and trades by hand.
   Your data then lives only in this browser (localStorage). */
window.SEED_DATA = {"version": 1, "deposits": [], "transactions": []};
