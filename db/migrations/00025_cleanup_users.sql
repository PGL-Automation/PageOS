-- +goose Up
-- Remove any identity.users that are not in the official staff list and are not
-- bootstrap system accounts. Unlinks person records first to avoid FK issues.

-- +goose StatementBegin
DO $$
DECLARE
    staff_emails text[] := ARRAY[
        -- Bootstrap accounts (always kept)
        'admin@pagegroup.ng',
        'hr@pagegroup.ng',
        -- PCL
        'Abideen.Mikail@pagecapitalng.com',
        'ojima.anyagba@pagecapitalng.com',
        'Chinonso.Okoroafor@pagecapitalng.com',
        'chinonyerem.amanze@pagecapitalng.com',
        'edwin.ojideagu@pagecapitalng.com',
        'Gabriel.Odediran@pageiml.com',
        'joseph.ehikioya@pagecapitalng.com',
        'ndifreke.obot@pageaml.com',
        'oladotun.murele@pagecapitalng.com',
        'oolabodunde@pagecapitalng.com',
        'otito.esedebe@pagecapitalng.com',
        'Rachael.Oyedele@pagecapitalng.com',
        'Sarah.Egbele@pagecapitalng.com',
        'victor.akomolafe@pagecapitalng.com',
        'Timi.Oloketuyi@pagecapitalng.com',
        -- PAML
        'adenike.odesanya@pageaml.com',
        'ahmed.umaru@pageaml.com',
        'Chiamaka.Mbachu@pageaml.com',
        'ebele.odukwe@pageaml.com',
        'gabriel.adepoju@pageaml.com',
        'Ifeoluwa.adesina@pageaml.com',
        'john.ezegbugha@pageaml.com',
        'kehinde.ojetola@pagecapitalng.com',
        'nneka.sunmonu@pageaml.com',
        'segun.agunbiade@pageaml.com',
        'temitope.adio@pageaml.com',
        'toyin.akinde@pageaml.com',
        'Gbenga.Olubayode@pageaml.com',
        -- Shared Service
        'amos.olanrewaju@pageaml.com',
        'damilola.osifala@pageaml.com',
        'Adewale.Bamiro@pagecapitalng.com',
        'olorunjeda.adegbulugbe@pagecapitalng.com',
        'chiamaka.dike@pageaml.com',
        'Halima.Yakubu@pageaml.com',
        'Franca.Imene@pageaml.com',
        'john.offuna@pagecapitalng.com',
        'obasi.egwu@pageaml.com',
        'olawunmi.oladigbo@pageaml.com',
        'oluwakemi.agboola@pageaml.com',
        'udochukwu.okigbo@pageaml.com',
        'Samuel.Fabunmi@pageaml.com'
    ];
BEGIN
    -- Unlink person records from non-staff user accounts.
    UPDATE organization.person
    SET user_id = NULL
    WHERE user_id IN (
        SELECT id FROM identity.users
        WHERE lower(email) != ALL(
            SELECT lower(e) FROM unnest(staff_emails) e
        )
    );

    -- Remove the non-staff user accounts.
    DELETE FROM identity.users
    WHERE lower(email) != ALL(
        SELECT lower(e) FROM unnest(staff_emails) e
    );
END $$;
-- +goose StatementEnd

-- +goose Down
-- Non-reversible: deleted accounts cannot be automatically restored.
SELECT 1;
